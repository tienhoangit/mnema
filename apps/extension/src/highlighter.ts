// Mnema Web Highlighter Content Script
import { buildAuthHeaders, getConfig } from './storage';

(function () {
  let floatingBtn: HTMLButtonElement | null = null;
  let activeSelectedText = '';

  function createFloatingButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'mnema-highlighter-badge';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;">
        <path d="m9 11-6 6v3h3l6-6"/>
        <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
      </svg>
      <span>Lưu highlight</span>
    `;

    Object.assign(btn.style, {
      position: 'absolute',
      zIndex: '2147483647',
      display: 'none',
      alignItems: 'center',
      padding: '6px 12px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#ffffff',
      backgroundColor: '#0d9488',
      border: 'none',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'transform 0.15s ease, background-color 0.15s ease',
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#0f766e';
      btn.style.transform = 'scale(1.04)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = '#0d9488';
      btn.style.transform = 'scale(1.0)';
    });

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleSaveHighlight();
    });

    document.body.appendChild(btn);
    return btn;
  }

  function getButton(): HTMLButtonElement {
    if (!floatingBtn) {
      floatingBtn = createFloatingButton();
    }
    return floatingBtn;
  }

  async function handleSaveHighlight() {
    const btn = getButton();
    if (!activeSelectedText) return;

    btn.innerHTML = '<span>Đang lưu...</span>';
    btn.disabled = true;

    try {
      const config = await getConfig();
      const headers = buildAuthHeaders(config);

      const res = await fetch(`${config.apiUrl}/api/highlights`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: activeSelectedText,
          url: window.location.href,
          title: document.title || window.location.href,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      btn.style.backgroundColor = '#16a34a';
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>Đã lưu!</span>
      `;

      setTimeout(() => {
        btn.style.display = 'none';
        btn.disabled = false;
        btn.style.backgroundColor = '#0d9488';
        btn.innerHTML = '<span>Lưu highlight</span>';
        window.getSelection()?.removeAllRanges();
      }, 1500);
    } catch (err) {
      console.warn('Mnema highlight save failed:', err);
      btn.style.backgroundColor = '#dc2626';
      btn.innerHTML = '<span>Lỗi lưu!</span>';
      setTimeout(() => {
        btn.style.display = 'none';
        btn.disabled = false;
        btn.style.backgroundColor = '#0d9488';
        btn.innerHTML = '<span>Lưu highlight</span>';
      }, 2000);
    }
  }

  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';

      if (text.length > 2 && selection && selection.rangeCount > 0) {
        activeSelectedText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const btn = getButton();
        btn.style.display = 'inline-flex';
        btn.style.top = `${window.scrollY + rect.top - 38}px`;
        btn.style.left = `${window.scrollX + Math.max(10, rect.left + rect.width / 2 - 50)}px`;
      } else {
        if (floatingBtn && floatingBtn.style.display !== 'none') {
          floatingBtn.style.display = 'none';
        }
      }
    }, 10);
  });
})();
export {};
