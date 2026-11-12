export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Bindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  AI?: WorkersAiBinding;
  GEMINI_API_KEY?: string;
  RESEND_API_KEY?: string;
  OAUTH_KV?: KVNamespace;
  MCP_PIN?: string;
  MCP_PIN_HASH?: string;
  AUTH_PIN_HASH?: string;
  REQUIRE_MCP_AUTH?: string;
  ALLOW_UNAUTH_MCP?: string;
  PUBLIC_ORIGIN?: string;
}

export interface TagRow {
  id: string;
  name: string;
  color: string;
  created_at?: string;
}

export interface SourceRow {
  id: string;
  name: string;
  author: string | null;
  type: string;
  url: string | null;
  image_url: string | null;
  content_html: string | null;
  reading_status: string;
  progress: number;
  word_count: number;
  reading_time: number;
  metadata: string | null;
  source_notes: string | null;
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface HighlightRow {
  id: string;
  source_id: string;
  content: string;
  note: string | null;
  color: string;
  location: string | null;
  favorite: number;
  is_in_review_queue: number;
  review_count: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string | null;
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface HighlightWithSource extends HighlightRow {
  source_name: string;
  source_author: string | null;
  source_type: string;
  source_url?: string | null;
  tags?: TagRow[];
}

export interface UserSettingsRow {
  id: string;
  digest_enabled: number;
  digest_email: string | null;
  digest_hour_utc: number;
  digest_count: number;
  resend_api_key: string | null;
  from_email: string | null;
  last_digest_sent_date: string | null;
  last_digest_sent_at: string | null;
  newsletter_secret: string | null;
  telegram_bot_token: string | null;
  telegram_webhook_secret: string | null;
  telegram_allowed_chat_id: string | null;
  notion_token: string | null;
  notion_database_id: string | null;
  gemini_api_key: string | null;
  updated_at: string;
}

export interface PublicUserSettings {
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

export interface RssFeedRow {
  id: string;
  title: string;
  url: string;
  site_url: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface PublicShareRow {
  id: string;
  slug: string;
  target_type: 'highlight' | 'source';
  target_id: string;
  is_active: number;
  view_count: number;
  created_at: string;
}

export interface EmbeddingRow {
  id: string;
  target_type: 'highlight' | 'source';
  embedding: string;
  model: string;
  content_hash: string;
  updated_at: string;
}

export interface AiThreadRow {
  id: string;
  title: string | null;
  source_id: string | null;
  highlight_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}
