export type ReadingStatus = 'inbox' | 'later' | 'archive' | 'want_to_read' | 'reading' | 'read';
export type SourceType = 'article' | 'book' | 'youtube' | 'tweet' | 'pdf' | 'podcast' | 'custom';
export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink';

export type ReaderPreset = 'paperback' | 'editorial' | 'modern' | 'focus';

export interface Tag {
  id: string;
  name: string;
  color?: string;
  count?: number;
}

export interface Highlight {
  id: string;
  source_id: string;
  source_name?: string;
  source_author?: string;
  source_type?: SourceType;
  source_url?: string;
  content: string;
  note?: string | null;
  color: HighlightColor;
  location?: string | null;
  favorite: number | boolean;
  is_in_review_queue: number | boolean;
  review_count?: number;
  ease_factor?: number;
  interval_days?: number;
  next_review_at?: string;
  created_at: string;
  tags?: Tag[];
  similarity?: number;
}

export interface TranscriptSegment {
  text: string;
  startSec: number;
  durationSec: number;
}

export interface SourceMetadata {
  site_name?: string;
  excerpt?: string;
  youtube_id?: string;
  transcript?: TranscriptSegment[];
}

export interface Source {
  id: string;
  name: string;
  author: string | null;
  type: SourceType;
  url: string | null;
  image_url: string | null;
  content_html: string | null;
  reading_status: ReadingStatus;
  progress: number;
  word_count: number;
  reading_time: number;
  metadata: string | null;
  source_notes?: string | null;
  highlight_count?: number;
  highlights?: Highlight[];
  created_at: string;
  updated_at: string;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  totalReviewsLogged: number;
}

export interface FullStats {
  highlightsThisMonth: number;
  highlightsLastMonth: number;
  totalHighlights: number;
  totalSources: number;
  totalReviews: number;
  currentStreak: number;
  longestStreak: number;
  consistencyPct: number;
  typeBreakdown: { type: string; count: number }[];
  topSources: { name: string; author: string; type: string; hl_count: number }[];
}

export interface ReaderSettings {
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: 'serif' | 'sans';
  fontSize: number; // in px
  contentWidth: number; // in px
  lineHeight: number;
  preset?: ReaderPreset;
}

export interface TrashData {
  sources: Source[];
  highlights: Highlight[];
  totalCount: number;
}

export interface SearchResults {
  sources: Source[];
  highlights: Highlight[];
  notes: Highlight[];
  total: number;
}

export interface UserSettings {
  digest_enabled: boolean;
  digest_email: string;
  digest_hour_utc: number;
  digest_count: number;
  has_resend_api_key: boolean;
  resend_api_key_masked: string;
  from_email: string;
  last_digest_sent_date: string | null;
  last_digest_sent_at: string | null;
  newsletter_secret: string;
  has_telegram_bot_token: boolean;
  telegram_bot_token_masked: string;
  telegram_webhook_secret: string;
  telegram_allowed_chat_id: string;
  has_notion_token: boolean;
  notion_token_masked: string;
  notion_database_id: string;
  has_gemini_api_key: boolean;
  gemini_api_key_masked: string;
}

export interface UserSettingsUpdate {
  digest_enabled?: boolean;
  digest_email?: string | null;
  digest_hour_utc?: number;
  digest_count?: number;
  resend_api_key?: string | null;
  from_email?: string | null;
  regenerate_newsletter_secret?: boolean;
  telegram_bot_token?: string | null;
  regenerate_telegram_secret?: boolean;
  telegram_allowed_chat_id?: string | null;
  notion_token?: string | null;
  notion_database_id?: string | null;
  gemini_api_key?: string | null;
}

export interface EmailPreview {
  subject: string;
  html: string;
  text: string;
  highlightsCount?: number;
}

export interface EmailLogEntry {
  id: string;
  email_type: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface RssFeed {
  id: string;
  title: string;
  url: string;
  site_url: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface PublicShare {
  id: string;
  slug: string;
  target_type: 'highlight' | 'source';
  target_id: string;
  is_active: number;
  view_count: number;
  created_at: string;
  share_path?: string;
  share_url?: string;
}

export interface PublicSharePayload {
  slug: string;
  target_type: 'highlight' | 'source';
  view_count: number;
  created_at: string;
  highlight?: Highlight & { source_image?: string | null };
  source?: Source;
  highlights?: Highlight[];
}

export interface SemanticSearchResult {
  highlights: Highlight[];
  model: string;
  provider: 'gemini' | 'workers_ai' | 'local_trigram';
  total: number;
}

export interface EmbeddingsStatus {
  totalHighlights: number;
  indexedHighlights: number;
  model: string | null;
  lastIndexedAt: string | null;
}

export interface OcrResult {
  text: string;
  passages: string[];
  mode: 'highlights_only' | 'full_page';
  model: string;
}
