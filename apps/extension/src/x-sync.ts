// X / Twitter Bookmarks Sync Content Script (x.com/i/bookmarks)

(function () {
  function injectSyncButton() {
    if (document.getElementById('mnema-x-sync-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'mnema-x-sync-widget';
    widget.innerHTML = `
      <div id="mnema-x-sync-bubble" style="
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        background: #0d9488;
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 9999px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        transition: transform 0.2s, background-color 0.2s;
      ">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        <span id="mnema-x-sync-text">Đồng bộ X Bookmarks sang Mnema</span>
      </div>
    `;

    document.body.appendChild(widget);

    const bubble = document.getElementById('mnema-x-sync-bubble');
    bubble?.addEventListener('mouseenter', () => {
      bubble.style.backgroundColor = '#0f766e';
      bubble.style.transform = 'scale(1.03)';
    });
    bubble?.addEventListener('mouseleave', () => {
      bubble.style.backgroundColor = '#0d9488';
      bubble.style.transform = 'scale(1.0)';
    });

    bubble?.addEventListener('click', handleSync);
  }

  function extractBookmarks() {
    const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
    const items: Array<{
      title: string;
      author: string;
      type: string;
      url: string;
      content: string;
      note?: string;
    }> = [];

    tweetArticles.forEach((article) => {
      const userEl = article.querySelector('div[data-testid="User-Name"]');
      const textEl = article.querySelector('div[data-testid="tweetText"]');

      // Find status link
      const statusLinks = article.querySelectorAll('a[href*="/status/"]');
      let statusHref = '';
      for (let i = 0; i < statusLinks.length; i++) {
        const href = statusLinks[i].getAttribute('href') || '';
        if (/\/status\/\d+/.test(href)) {
          statusHref = href.startsWith('http') ? href : `https://x.com${href}`;
          break;
        }
      }

      const author = userEl?.textContent?.replace(/\s+/g, ' ').trim() || 'X User';
      const text = textEl?.textContent?.trim() || '';

      if (text && text.length > 5) {
        items.push({
          title: `Tweet by ${author.slice(0, 40)}`,
          author,
          type: 'tweet',
          url: statusHref || window.location.href,
          content: text,
          note: 'Imported from X Bookmarks',
        });
      }
    });

    return items;
  }

  async function handleSync() {
    const textSpan = document.getElementById('mnema-x-sync-text');
    if (textSpan) textSpan.textContent = 'Đang quét bookmarks...';

    const items = extractBookmarks();

    if (items.length === 0) {
      if (textSpan) textSpan.textContent = 'Không tìm thấy bookmarks trên màn hình!';
      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Đồng bộ X Bookmarks sang Mnema';
      }, 2500);
      return;
    }

    if (textSpan) textSpan.textContent = `Đang đồng bộ ${items.length} bookmarks...`;

    try {
      const config = await new Promise<{ apiUrl: string; apiToken: string }>((resolve) => {
        chrome.storage.local.get(['mnema_api_url', 'mnema_api_token'], (items: Record<string, any>) => {
          const rawUrl = items && typeof items.mnema_api_url === 'string' ? items.mnema_api_url : 'http://127.0.0.1:8787';
          const rawToken = items && typeof items.mnema_api_token === 'string' ? items.mnema_api_token : '';
          resolve({
            apiUrl: rawUrl.replace(/\/+$/, ''),
            apiToken: rawToken,
          });
        });
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiToken) {
        headers['Authorization'] = `Bearer ${config.apiToken}`;
        headers['X-Api-Key'] = config.apiToken;
      }

      const res = await fetch(`${config.apiUrl}/api/import/json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(items),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const resJson = await res.json();
      const count = resJson.totalImported ?? items.length;
      if (textSpan) textSpan.textContent = `✓ Đã đồng bộ ${count} bookmarks!`;

      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Đồng bộ X Bookmarks sang Mnema';
      }, 3000);
    } catch (err: any) {
      console.warn('X bookmarks sync failed:', err);
      if (textSpan) textSpan.textContent = `Lỗi: ${err.message || 'Thất bại'}`;
      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Đồng bộ X Bookmarks sang Mnema';
      }, 3000);
    }
  }

  // Periodic check or DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSyncButton);
  } else {
    injectSyncButton();
  }

  // Handle SPA navigation on X
  setInterval(() => {
    if (window.location.href.includes('/bookmarks')) {
      injectSyncButton();
    }
  }, 2000);
})();
export {};
