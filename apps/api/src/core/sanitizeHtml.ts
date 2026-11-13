import { parseHTML } from 'linkedom';

const DROP_CONTENT_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'template',
  'noscript',
  'base',
  'meta',
  'link',
  'title',
  'head',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'option',
]);

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'div',
  'span',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'figure',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'kbd',
  'samp',
  'var',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'a',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'sub',
  'sup',
  'small',
  'abbr',
  'cite',
  'q',
  'time',
  'img',
  'picture',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
  'details',
  'summary',
]);

const GLOBAL_ALLOWED_ATTRS = new Set([
  'class',
  'id',
  'title',
  'lang',
  'dir',
  'role',
  'aria-label',
  'aria-hidden',
]);

const TAG_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'rel', 'target']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding']),
  td: new Set(['colspan', 'rowspan', 'scope']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'type', 'reversed']),
  time: new Set(['datetime']),
};

function isSafeHref(raw: string): boolean {
  const cleaned = raw.replace(/[\u0000-\u0020\u007F]+/g, '');
  if (!cleaned) return false;
  if (cleaned.startsWith('#')) return true;
  if (cleaned.startsWith('/') && !cleaned.startsWith('//')) return true;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function isSafeImgSrc(raw: string): boolean {
  const cleaned = raw.replace(/[\u0000-\u0020\u007F]+/g, '');
  if (!cleaned) return false;
  if (cleaned.startsWith('/') && !cleaned.startsWith('//')) return true;
  if (/^data:image\/(png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(cleaned)) {
    return true;
  }
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeNode(node: any): void {
  const children = Array.from(node.childNodes || []) as any[];
  for (const child of children) {
    // 1 = ELEMENT_NODE, 3 = TEXT_NODE, 8 = COMMENT_NODE
    if (child.nodeType === 8) {
      node.removeChild(child);
      continue;
    }
    if (child.nodeType !== 1) {
      continue;
    }

    const tag = String(child.tagName || '').toLowerCase();

    if (DROP_CONTENT_TAGS.has(tag)) {
      node.removeChild(child);
      continue;
    }

    // Recursively sanitize descendants first
    sanitizeNode(child);

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap unknown/disallowed tag while preserving its sanitized children
      const grandChildren = Array.from(child.childNodes || []) as any[];
      for (const gc of grandChildren) {
        node.insertBefore(gc, child);
      }
      node.removeChild(child);
      continue;
    }

    // Filter attributes against strict allowlist
    const tagAllowed = TAG_ALLOWED_ATTRS[tag];
    const attrs = Array.from(child.attributes || []) as Array<{ name: string; value: string }>;
    for (const attr of attrs) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith('on')) {
        child.removeAttribute(attr.name);
        continue;
      }
      const allowed = GLOBAL_ALLOWED_ATTRS.has(attrName) || Boolean(tagAllowed?.has(attrName));
      if (!allowed) {
        child.removeAttribute(attr.name);
        continue;
      }

      if (tag === 'a' && attrName === 'href') {
        if (!isSafeHref(attr.value)) {
          child.setAttribute('href', '#');
        }
      } else if (tag === 'img' && attrName === 'src') {
        if (!isSafeImgSrc(attr.value)) {
          child.removeAttribute('src');
        }
      } else if (tag === 'a' && attrName === 'target') {
        if (attr.value !== '_blank' && attr.value !== '_self') {
          child.removeAttribute('target');
        }
      }
    }

    if (tag === 'a' && child.getAttribute('target') === '_blank') {
      child.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const { document } = parseHTML(`<div id="__mnema_root__">${html}</div>`);
  const root = document.getElementById('__mnema_root__');
  if (!root) return '';
  sanitizeNode(root);
  return root.innerHTML;
}
