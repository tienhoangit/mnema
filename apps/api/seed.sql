-- Seed initial sample data for demonstration

INSERT OR IGNORE INTO sources (id, name, author, type, url, reading_status, word_count, reading_time, content_html, created_at, updated_at)
VALUES (
  'sample-article-1',
  'Building a Second Brain: An Overview of the CODE Method',
  'Tiago Forte',
  'article',
  'https://fortelabs.com/blog/basb-overview/',
  'inbox',
  850,
  4,
  '<h2>The Four Steps of Personal Knowledge Management</h2><p>A Second Brain is an external, centralized digital repository for the things you learn and the resources you acquire. It turns knowledge into action.</p><h3>1. Capture: Keep What Resonates</h3><p>Don’t save everything. Only capture what truly surprises, challenges, or inspires you. Curate your intellectual diet with care.</p><h3>2. Organize: Save for Actionability</h3><p>Organize by project, area, resource, and archive (the PARA method). Information is only useful when it is tied to an active endeavor.</p><h3>3. Distill: Find the Essence</h3><p>Every time you revisit a note, make it more discoverable. Use Progressive Summarization: bold key sentences, highlight the best parts, and write executive summaries.</p><h3>4. Express: Show Your Work</h3><p>Knowledge becomes valuable when it is synthesized and shared. Stop hoarding information and start creating tangible assets.</p>',
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
);

INSERT OR IGNORE INTO sources (id, name, author, type, reading_status, word_count, reading_time, created_at, updated_at)
VALUES (
  'sample-book-1',
  'Atomic Habits: An Easy & Proven Way to Build Good Habits & Break Bad Ones',
  'James Clear',
  'book',
  'archive',
  1200,
  6,
  datetime('now', '-10 days'),
  datetime('now', '-10 days')
);

INSERT OR IGNORE INTO highlights (id, source_id, content, note, color, location, favorite, is_in_review_queue, created_at, updated_at)
VALUES (
  'sample-hl-1',
  'sample-article-1',
  'Every time you revisit a note, make it more discoverable. Use Progressive Summarization: bold key sentences, highlight the best parts, and write executive summaries.',
  'Core concept for personal knowledge distillation.',
  'yellow',
  'Step 3',
  1,
  1,
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
);

INSERT OR IGNORE INTO highlights (id, source_id, content, note, color, location, favorite, is_in_review_queue, created_at, updated_at)
VALUES (
  'sample-hl-2',
  'sample-book-1',
  'You do not rise to the level of your goals. You fall to the level of your systems.',
  'Focus on daily systems, not just distant milestones.',
  'green',
  'Chapter 1, Page 27',
  1,
  1,
  datetime('now', '-5 days'),
  datetime('now', '-5 days')
);

INSERT OR IGNORE INTO highlights (id, source_id, content, note, color, location, favorite, is_in_review_queue, created_at, updated_at)
VALUES (
  'sample-hl-3',
  'sample-book-1',
  'All big things come from small beginnings. The seed of every habit is a single, tiny decision.',
  NULL,
  'blue',
  'Chapter 2, Page 43',
  0,
  1,
  datetime('now', '-4 days'),
  datetime('now', '-4 days')
);

INSERT OR IGNORE INTO streak (id, current_streak, longest_streak, last_active_date)
VALUES ('default', 3, 5, date('now'))
ON CONFLICT(id) DO UPDATE SET current_streak = 3, longest_streak = 5, last_active_date = date('now');

