import { getConfig, saveConfig } from './storage';

document.addEventListener('DOMContentLoaded', async () => {
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const statusDiv = document.getElementById('status-msg') as HTMLDivElement;
  const statusSelect = document.getElementById('reading-status') as HTMLSelectElement;
  const toggleSettingsBtn = document.getElementById('toggle-settings') as HTMLButtonElement;
  const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
  const apiUrlInput = document.getElementById('api-url') as HTMLInputElement;
  const apiTokenInput = document.getElementById('api-token') as HTMLInputElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;

  // Load existing settings
  const config = await getConfig();
  if (apiUrlInput) apiUrlInput.value = config.apiUrl;
  if (apiTokenInput) apiTokenInput.value = config.apiToken;

  toggleSettingsBtn?.addEventListener('click', () => {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? 'block' : 'none';
  });

  saveSettingsBtn?.addEventListener('click', async () => {
    await saveConfig({
      apiUrl: apiUrlInput.value.trim(),
      apiToken: apiTokenInput.value.trim(),
    });
    showStatus('Settings saved!', 'success');
    settingsPanel.style.display = 'none';
  });

  function showStatus(text: string, type: 'success' | 'error' | 'loading') {
    statusDiv.style.display = 'block';
    statusDiv.className = `status-banner status-${type}`;
    statusDiv.textContent = text;
  }

  saveBtn?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    showStatus('Extracting clean content from tab...', 'loading');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('Unable to access current browser tab');
      }

      // 1. Inject official Mozilla Readability into the tab
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['vendor/Readability.js'],
        });
      } catch (injectErr) {
        console.warn('Readability file injection warning:', injectErr);
      }

      // 2. Execute clean in-browser Readability extraction
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Clone DOM so Readability does not mutate active webpage
          const docClone = document.cloneNode(true) as Document;

          let title = document.title || 'Untitled Article';
          let author: string | null = null;
          let leadImage: string | null = null;
          let contentHtml = '';
          let wordCount = 0;
          let readingTime = 1;

          // Attempt extraction with Mozilla Readability
          const Reader = (window as any).Readability;
          if (typeof Reader === 'function') {
            try {
              const article = new Reader(docClone).parse();
              if (article) {
                title = article.title || title;
                author = article.byline || null;
                contentHtml = article.content || '';
                const text = article.textContent || '';
                wordCount = text.trim().split(/\s+/).filter(Boolean).length;
                readingTime = Math.max(1, Math.round(wordCount / 200));
              }
            } catch (readabilityErr) {
              console.warn('In-tab Readability parsing exception, using fallback:', readabilityErr);
            }
          }

          // Fallback if Readability returned empty or failed
          if (!contentHtml) {
            const badElements = docClone.querySelectorAll(
              'script, style, noscript, iframe, nav, footer, header, aside, .advertisement, [aria-hidden="true"]'
            );
            badElements.forEach((el) => el.remove());

            const articleEl =
              docClone.querySelector('article') ||
              docClone.querySelector('main') ||
              docClone.querySelector('.post-content, .article-content, #content, .entry-content') ||
              docClone.body;

            contentHtml = articleEl ? articleEl.innerHTML : '';
            const text = articleEl ? articleEl.textContent || '' : '';
            wordCount = text.trim().split(/\s+/).filter(Boolean).length;
            readingTime = Math.max(1, Math.round(wordCount / 200));
          }

          // Metadata extraction
          const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
          if (ogTitle && (!title || title === 'Untitled Article')) {
            title = ogTitle;
          }

          if (!author) {
            author =
              document.querySelector('meta[name="author"]')?.getAttribute('content') ||
              document.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
              null;
          }

          leadImage =
            document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
            document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
            null;

          return {
            title,
            author,
            leadImage,
            contentHtml,
            wordCount,
            readingTime,
            url: window.location.href,
          };
        },
      });

      const extracted = injectionResults?.[0]?.result;
      if (!extracted) {
        throw new Error('Could not parse clean article content');
      }

      showStatus('Sending article to Mnema...', 'loading');

      const currentConfig = await getConfig();
      const readingStatus = statusSelect.value || 'inbox';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentConfig.apiToken) {
        headers['Authorization'] = `Bearer ${currentConfig.apiToken}`;
        headers['X-Api-Key'] = currentConfig.apiToken;
      }

      const res = await fetch(`${currentConfig.apiUrl}/api/sources`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: extracted.title,
          author: extracted.author,
          type: 'article',
          url: extracted.url,
          image_url: extracted.leadImage,
          content_html: extracted.contentHtml,
          word_count: extracted.wordCount,
          reading_time: extracted.readingTime,
          reading_status: readingStatus,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned HTTP ${res.status}`);
      }

      showStatus(`Saved "${extracted.title.slice(0, 30)}..." to Mnema!`, 'success');
    } catch (err: any) {
      showStatus(err.message || 'Failed to save article', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
});
