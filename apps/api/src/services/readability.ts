import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { safeFetch } from './urlSafety';

export interface ParsedArticle {
  title: string;
  byline: string | null;
  content: string; // cleaned HTML
  textContent: string;
  excerpt: string;
  siteName: string | null;
  wordCount: number;
  readingTimeMinutes: number;
  leadImageUrl: string | null;
}

export async function parseArticleFromUrl(url: string): Promise<ParsedArticle> {
  const { response, finalUrl } = await safeFetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseArticleHtml(html, finalUrl);
}

export function parseArticleHtml(html: string, originalUrl?: string): ParsedArticle {
  const { document } = parseHTML(html);

  // Extract meta tags before Readability mutates document
  const getMeta = (names: string[]): string | null => {
    for (const name of names) {
      const el =
        document.querySelector(`meta[property="${name}"]`) ||
        document.querySelector(`meta[name="${name}"]`);
      if (el) {
        const val = el.getAttribute('content');
        if (val) return val.trim();
      }
    }
    return null;
  };

  const metaImage = getMeta(['og:image', 'twitter:image', 'image']);
  const metaAuthor = getMeta(['author', 'article:author', 'og:article:author', 'twitter:creator']);
  const metaSiteName = getMeta(['og:site_name', 'application-name', 'twitter:site']);

  // Convert relative img src to absolute if originalUrl is provided
  if (originalUrl) {
    try {
      const base = new URL(originalUrl);
      const images = document.querySelectorAll('img');
      images.forEach((img: any) => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
          try {
            img.setAttribute('src', new URL(src, base).href);
          } catch {}
        }
      });
    } catch {}
  }

  const reader = new Readability(document as any);
  const article = reader.parse();

  if (!article) {
    throw new Error('Could not extract readable content from this page.');
  }

  const textContent = article.textContent?.trim() || '';
  const words = textContent ? textContent.split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.round(words / 200));

  return {
    title: article.title || 'Untitled',
    byline: article.byline || metaAuthor,
    content: article.content || '',
    textContent,
    excerpt: article.excerpt || textContent.slice(0, 180) + '...',
    siteName: article.siteName || metaSiteName,
    wordCount: words,
    readingTimeMinutes: readingTime,
    leadImageUrl: metaImage,
  };
}
