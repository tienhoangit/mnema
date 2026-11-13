import { Hono } from 'hono';
import { Bindings } from '../../types';

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/sources/search-books - Search books online via OpenLibrary
app.get('/search-books', async (c) => {
  const query = c.req.query('q')?.trim();
  if (!query) return c.json({ data: [] });

  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
    );
    if (!res.ok) return c.json({ data: [] });

    const json: any = await res.json();
    const docs = json.docs || [];

    const books = docs.map((doc: any) => {
      const coverId = doc.cover_i;
      const coverUrl = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
        : null;

      return {
        title: doc.title,
        author: doc.author_name ? doc.author_name.join(', ') : null,
        firstPublishYear: doc.first_publish_year || null,
        coverUrl,
        isbn: doc.isbn ? doc.isbn[0] : null,
      };
    });

    return c.json({ data: books });
  } catch (err: any) {
    console.warn('OpenLibrary search error:', err.message);
    return c.json({ data: [] });
  }
});

export default app;
