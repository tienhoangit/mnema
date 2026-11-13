import { PublicUserSettings, UserSettingsRow } from '../types';

function generateSecret(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

function maskSecret(val: string | null): string {
  if (!val) return '';
  if (val.length <= 8) return '••••••••';
  return `${val.slice(0, 4)}••••${val.slice(-4)}`;
}

export async function ensureSettingsTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      digest_enabled INTEGER NOT NULL DEFAULT 0,
      digest_email TEXT,
      digest_hour_utc INTEGER NOT NULL DEFAULT 8,
      digest_count INTEGER NOT NULL DEFAULT 5,
      resend_api_key TEXT,
      from_email TEXT,
      last_digest_sent_date TEXT,
      last_digest_sent_at TEXT,
      newsletter_secret TEXT,
      telegram_bot_token TEXT,
      telegram_webhook_secret TEXT,
      telegram_allowed_chat_id TEXT,
      notion_token TEXT,
      notion_database_id TEXT,
      gemini_api_key TEXT,
      timezone_offset_minutes INTEGER NOT NULL DEFAULT 420,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`INSERT OR IGNORE INTO user_settings (id) VALUES ('default')`).run();
}

export async function getSettings(db: D1Database): Promise<UserSettingsRow> {
  let row = await db.prepare(`SELECT * FROM user_settings WHERE id = 'default'`).first<UserSettingsRow>();

  if (!row) {
    await ensureSettingsTable(db);
    row = await db.prepare(`SELECT * FROM user_settings WHERE id = 'default'`).first<UserSettingsRow>();
  }

  if (!row) {
    throw new Error('Failed to initialize user_settings');
  }

  let needsUpdate = false;
  let newsletterSecret = row.newsletter_secret;
  let telegramSecret = row.telegram_webhook_secret;

  if (!newsletterSecret) {
    newsletterSecret = generateSecret();
    needsUpdate = true;
  }
  if (!telegramSecret) {
    telegramSecret = generateSecret();
    needsUpdate = true;
  }

  if (needsUpdate) {
    await db.prepare(`
      UPDATE user_settings
      SET newsletter_secret = ?, telegram_webhook_secret = ?, updated_at = ?
      WHERE id = 'default'
    `).bind(newsletterSecret, telegramSecret, new Date().toISOString()).run();

    row = {
      ...row,
      newsletter_secret: newsletterSecret,
      telegram_webhook_secret: telegramSecret,
    };
  }

  return row;
}

export function toPublicSettings(row: UserSettingsRow): PublicUserSettings {
  return {
    digest_enabled: row.digest_enabled === 1,
    digest_email: row.digest_email || '',
    digest_hour_utc: row.digest_hour_utc ?? 8,
    digest_count: row.digest_count ?? 5,
    has_resend_api_key: Boolean(row.resend_api_key),
    resend_api_key_masked: maskSecret(row.resend_api_key),
    from_email: row.from_email || '',
    last_digest_sent_date: row.last_digest_sent_date,
    last_digest_sent_at: row.last_digest_sent_at,
    has_newsletter_secret: Boolean(row.newsletter_secret),
    newsletter_secret_masked: maskSecret(row.newsletter_secret),
    newsletter_secret: maskSecret(row.newsletter_secret),
    has_telegram_bot_token: Boolean(row.telegram_bot_token),
    telegram_bot_token_masked: maskSecret(row.telegram_bot_token),
    has_telegram_webhook_secret: Boolean(row.telegram_webhook_secret),
    telegram_webhook_secret_masked: maskSecret(row.telegram_webhook_secret),
    telegram_webhook_secret: maskSecret(row.telegram_webhook_secret),
    telegram_allowed_chat_id: row.telegram_allowed_chat_id || '',
    has_notion_token: Boolean(row.notion_token),
    notion_token_masked: maskSecret(row.notion_token),
    notion_database_id: row.notion_database_id || '',
    has_gemini_api_key: Boolean(row.gemini_api_key),
    gemini_api_key_masked: maskSecret(row.gemini_api_key),
    timezone_offset_minutes: typeof row.timezone_offset_minutes === 'number' ? row.timezone_offset_minutes : 420,
  };
}

export interface SettingsUpdateInput {
  digest_enabled?: boolean;
  digest_email?: string | null;
  digest_hour_utc?: number;
  digest_count?: number;
  resend_api_key?: string | null;
  from_email?: string | null;
  newsletter_secret?: string | null;
  regenerate_newsletter_secret?: boolean;
  telegram_bot_token?: string | null;
  telegram_webhook_secret?: string | null;
  regenerate_telegram_secret?: boolean;
  telegram_allowed_chat_id?: string | null;
  notion_token?: string | null;
  notion_database_id?: string | null;
  gemini_api_key?: string | null;
  timezone_offset_minutes?: number;
}

function isMaskedValue(val: string): boolean {
  return val.includes('••••');
}

export async function updateSettings(
  db: D1Database,
  input: SettingsUpdateInput
): Promise<UserSettingsRow> {
  await getSettings(db);

  const updates: string[] = [];
  const params: Array<string | number | null> = [];

  if (input.digest_enabled !== undefined) {
    updates.push('digest_enabled = ?');
    params.push(input.digest_enabled ? 1 : 0);
  }
  if (input.digest_email !== undefined) {
    updates.push('digest_email = ?');
    params.push(input.digest_email ? input.digest_email.trim() : null);
  }
  if (input.digest_hour_utc !== undefined && Number.isFinite(input.digest_hour_utc)) {
    const hour = Math.min(23, Math.max(0, Math.floor(input.digest_hour_utc)));
    updates.push('digest_hour_utc = ?');
    params.push(hour);
  }
  if (input.digest_count !== undefined && Number.isFinite(input.digest_count)) {
    const count = Math.min(20, Math.max(1, Math.floor(input.digest_count)));
    updates.push('digest_count = ?');
    params.push(count);
  }
  if (input.resend_api_key !== undefined) {
    const trimmed = input.resend_api_key?.trim() || '';
    if (trimmed === '') {
      updates.push('resend_api_key = ?');
      params.push(null);
    } else if (!isMaskedValue(trimmed)) {
      updates.push('resend_api_key = ?');
      params.push(trimmed);
    }
  }
  if (input.from_email !== undefined) {
    updates.push('from_email = ?');
    params.push(input.from_email ? input.from_email.trim() : null);
  }
  if (input.regenerate_newsletter_secret) {
    updates.push('newsletter_secret = ?');
    params.push(generateSecret());
  } else if (input.newsletter_secret !== undefined) {
    const trimmed = input.newsletter_secret?.trim() || '';
    if (trimmed && !isMaskedValue(trimmed)) {
      updates.push('newsletter_secret = ?');
      params.push(trimmed);
    }
  }
  if (input.telegram_bot_token !== undefined) {
    const trimmed = input.telegram_bot_token?.trim() || '';
    if (trimmed === '') {
      updates.push('telegram_bot_token = ?');
      params.push(null);
    } else if (!isMaskedValue(trimmed)) {
      updates.push('telegram_bot_token = ?');
      params.push(trimmed);
    }
  }
  if (input.regenerate_telegram_secret) {
    updates.push('telegram_webhook_secret = ?');
    params.push(generateSecret());
  } else if (input.telegram_webhook_secret !== undefined) {
    const trimmed = input.telegram_webhook_secret?.trim() || '';
    if (trimmed && !isMaskedValue(trimmed)) {
      updates.push('telegram_webhook_secret = ?');
      params.push(trimmed);
    }
  }
  if (input.telegram_allowed_chat_id !== undefined) {
    updates.push('telegram_allowed_chat_id = ?');
    params.push(input.telegram_allowed_chat_id ? input.telegram_allowed_chat_id.trim() : null);
  }
  if (input.notion_token !== undefined) {
    const trimmed = input.notion_token?.trim() || '';
    if (trimmed === '') {
      updates.push('notion_token = ?');
      params.push(null);
    } else if (!isMaskedValue(trimmed)) {
      updates.push('notion_token = ?');
      params.push(trimmed);
    }
  }
  if (input.notion_database_id !== undefined) {
    updates.push('notion_database_id = ?');
    params.push(input.notion_database_id ? input.notion_database_id.trim() : null);
  }
  if (input.gemini_api_key !== undefined) {
    const trimmed = input.gemini_api_key?.trim() || '';
    if (trimmed === '') {
      updates.push('gemini_api_key = ?');
      params.push(null);
    } else if (!isMaskedValue(trimmed)) {
      updates.push('gemini_api_key = ?');
      params.push(trimmed);
    }
  }
  if (input.timezone_offset_minutes !== undefined && Number.isFinite(input.timezone_offset_minutes)) {
    const tz = Math.min(840, Math.max(-720, Math.round(input.timezone_offset_minutes)));
    updates.push('timezone_offset_minutes = ?');
    params.push(tz);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    await db
      .prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE id = 'default'`)
      .bind(...params)
      .run();
  }

  return getSettings(db);
}
