// Kindle Notebook Sync Content Script (read.amazon.com/notebook)
import { buildAuthHeaders, getConfig } from './storage';

(function () {
  function injectSyncButton() {
    if (document.getElementById('mnema-kindle-sync-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'mnema-kindle-sync-widget';
    widget.innerHTML = `
      <div id="mnema-sync-bubble" style="
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
          <polyline points="10 10 14 14 18 10"></polyline>
        </svg>
        <span id="mnema-sync-text">Đồng bộ Kindle sang Mnema</span>
      </div>
    `;

    document.body.appendChild(widget);

    const bubble = document.getElementById('mnema-sync-bubble');
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

  function extractKindleHighlights() {
    // Extract currently active book details
    const titleEl =
      document.querySelector('#kp-notebook-highlights h2') ||
      document.querySelector('.kp-notebook-metadata h2') ||
      document.querySelector('.kp-notebook-selectable h2') ||
      document.querySelector('h2.a-color-base');

    const authorEl =
      document.querySelector('#kp-notebook-highlights p.kp-notebook-metadata') ||
      document.querySelector('.kp-notebook-metadata p') ||
      document.querySelector('p.kp-notebook-selectable');

    const bookTitle = titleEl?.textContent?.trim() || 'Kindle Book';
    const bookAuthor = authorEl?.textContent?.replace(/^By:\s*/i, '').trim() || null;

    // Extract highlight annotations
    const highlightElements = document.querySelectorAll(
      '#kp-notebook-annotations .a-spacing-base, .kp-notebook-highlight, .kp-notebook-annotation-container'
    );

    const highlights: Array<{ text: string; note?: string; location?: string }> = [];

    highlightElements.forEach((el) => {
      const textEl =
        el.querySelector('#highlight') ||
        el.querySelector('.kps-source-text') ||
        el.querySelector('.kp-notebook-highlight-annotation') ||
        el.querySelector('.a-size-base-plus');

      const noteEl = el.querySelector('#note') || el.querySelector('.kp-notebook-note');
      const locEl = el.querySelector('#annotationHighlightHeader') || el.querySelector('.kp-notebook-metadata');

      const text = textEl?.textContent?.trim();
      if (text && text.length > 3) {
        highlights.push({
          text,
          note: noteEl?.textContent?.trim() || undefined,
          location: locEl?.textContent?.trim() || undefined,
        });
      }
    });

    return {
      bookTitle,
      bookAuthor,
      highlights,
    };
  }

  async function handleSync() {
    const textSpan = document.getElementById('mnema-sync-text');
    if (textSpan) textSpan.textContent = 'Đang quét trích dẫn...';

    const { bookTitle, bookAuthor, highlights } = extractKindleHighlights();

    if (highlights.length === 0) {
      if (textSpan) textSpan.textContent = 'Không tìm thấy trích dẫn!';
      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Đồng bộ Kindle sang Mnema';
      }, 2500);
      return;
    }

    if (textSpan) textSpan.textContent = `Đang gửi ${highlights.length} trích dẫn...`;

    try {
      const config = await getConfig();

      const payload = [
        {
          title: bookTitle,
          author: bookAuthor,
          type: 'book',
          highlights,
        },
      ];

      const headers = buildAuthHeaders(config);

      const res = await fetch(`${config.apiUrl}/api/import/json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const resJson = await res.json();
      const count = resJson.totalImported ?? highlights.length;
      if (textSpan) textSpan.textContent = `✓ Đã đồng bộ ${count} trích dẫn!`;

      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Đồng bộ Kindle sang Mnema';
      }, 3000);
    } catch (err: any) {
      console.warn('Kindle sync failed:', err);
      if (textSpan) textSpan.textContent = `Lỗi: ${err.message || 'Thất bại'}`;
      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Đồng bộ Kindle sang Mnema';
      }, 3000);
    }
  }

  // Inject once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSyncButton);
  } else {
    injectSyncButton();
  }
})();
export {};
