import { Bindings, HighlightWithSource, SourceRow } from '../types';
import { getSettings } from './settings';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildDigestEmail(
  highlights: HighlightWithSource[],
  appUrl = 'https://mnema.mnema.workers.dev'
): RenderedEmail {
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const subject = `Your Daily Mnema Review — ${highlights.length} Highlight${highlights.length === 1 ? '' : 's'} (${dateLabel})`;

  const itemsHtml = highlights
    .map((h) => {
      const quote = escapeHtml(h.content);
      const sourceName = escapeHtml(h.source_name || 'Untitled Source');
      const author = h.source_author ? ` · ${escapeHtml(h.source_author)}` : '';
      const loc = h.location ? ` · Loc ${escapeHtml(h.location)}` : '';
      const noteHtml = h.note
        ? `<div style="margin-top:12px;padding:10px 14px;background:#fef3c7;border-radius:10px;color:#78350f;font-size:13px;line-height:1.5;"><strong>Note:</strong> ${escapeHtml(h.note)}</div>`
        : '';

      return `
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid #115e59;border-radius:14px;padding:20px;margin-bottom:16px;">
          <blockquote style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:16px;line-height:1.65;color:#171717;">
            “${quote}”
          </blockquote>
          ${noteHtml}
          <div style="margin-top:14px;font-size:12px;color:#6b7280;font-family:system-ui,sans-serif;">
            <strong style="color:#115e59;">${sourceName}</strong>${author}${loc}
          </div>
        </div>
      `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf9f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:620px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:10px;background:linear-gradient(135deg,#2e1f8f,#6d28d9);color:#fff;font-weight:700;font-size:18px;">M</div>
      <h1 style="margin:12px 0 4px;font-size:22px;color:#111827;">Daily Highlight Review</h1>
      <p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(dateLabel)} · ${highlights.length} spaced repetition quote${highlights.length === 1 ? '' : 's'}</p>
    </div>
    ${itemsHtml}
    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;margin-bottom:12px;">Open Mnema Review</a>
      <p style="margin:8px 0 0;">Sent by your personal Mnema workspace on Cloudflare Workers.</p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Daily Mnema Review (${dateLabel})`,
    '='.repeat(40),
    '',
    ...highlights.map((h, i) => {
      const lines = [`${i + 1}. "${h.content}"`];
      if (h.note) lines.push(`   Note: ${h.note}`);
      lines.push(
        `   — ${h.source_name || 'Untitled'}${h.source_author ? ` (${h.source_author})` : ''}`
      );
      lines.push('');
      return lines.join('\n');
    }),
    `Open Mnema: ${appUrl}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildHighlightEmail(
  highlight: HighlightWithSource,
  includeNote = true,
  customSubject?: string
): RenderedEmail {
  const sourceName = highlight.source_name || 'Mnema Library';
  const subject =
    customSubject?.trim() || `Highlight from "${sourceName}"`;

  const noteHtml =
    includeNote && highlight.note
      ? `<div style="margin-top:16px;padding:12px 16px;background:#fef3c7;border-radius:10px;color:#78350f;font-size:14px;line-height:1.5;"><strong>Personal Note:</strong> ${escapeHtml(highlight.note)}</div>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf9f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid #115e59;border-radius:16px;padding:28px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#115e59;font-weight:700;margin-bottom:12px;">Shared Highlight</div>
      <blockquote style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:18px;line-height:1.7;color:#111827;">
        “${escapeHtml(highlight.content)}”
      </blockquote>
      ${noteHtml}
      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #f3f4f6;font-size:13px;color:#4b5563;">
        <strong>${escapeHtml(sourceName)}</strong>
        ${highlight.source_author ? ` · by ${escapeHtml(highlight.source_author)}` : ''}
        ${highlight.location ? ` · ${escapeHtml(highlight.location)}` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

  const textLines = [
    `"${highlight.content}"`,
    '',
  ];
  if (includeNote && highlight.note) {
    textLines.push(`Note: ${highlight.note}`, '');
  }
  textLines.push(
    `— ${sourceName}${highlight.source_author ? ` by ${highlight.source_author}` : ''}`
  );

  return { subject, html, text: textLines.join('\n') };
}

export function buildSourceEmail(
  source: SourceRow,
  highlights: HighlightWithSource[],
  includeNotes = true,
  customSubject?: string
): RenderedEmail {
  const subject =
    customSubject?.trim() ||
    `Reading Notes: ${source.name}${source.author ? ` — ${source.author}` : ''}`;

  const sourceNotesHtml =
    includeNotes && source.source_notes
      ? `<div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:14px;padding:18px;margin-bottom:22px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#115e59;font-weight:700;margin-bottom:8px;">Source Notes & Synthesis</div>
          <div style="font-size:14px;line-height:1.65;color:#134e4a;white-space:pre-wrap;">${escapeHtml(source.source_notes)}</div>
        </div>`
      : '';

  const hlHtml = highlights
    .map((h) => {
      const noteBlock =
        includeNotes && h.note
          ? `<div style="margin-top:10px;padding:8px 12px;background:#fef3c7;border-radius:8px;color:#78350f;font-size:13px;"><strong>Note:</strong> ${escapeHtml(h.note)}</div>`
          : '';
      const locBlock = h.location
        ? `<div style="margin-top:8px;font-size:11px;color:#9ca3af;">Location: ${escapeHtml(h.location)}</div>`
        : '';
      return `<div style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid #14b8a6;border-radius:12px;padding:16px;margin-bottom:14px;">
        <blockquote style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.6;color:#171717;">“${escapeHtml(h.content)}”</blockquote>
        ${noteBlock}
        ${locBlock}
      </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf9f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#115e59;font-weight:700;">${escapeHtml(source.type)} Summary</div>
      <h1 style="margin:6px 0 4px;font-family:Georgia,serif;font-size:24px;color:#111827;">${escapeHtml(source.name)}</h1>
      ${source.author ? `<p style="margin:0;font-size:14px;color:#6b7280;">By ${escapeHtml(source.author)}</p>` : ''}
      <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">${highlights.length} highlight${highlights.length === 1 ? '' : 's'}</p>
    </div>
    ${sourceNotesHtml}
    ${hlHtml || '<p style="font-size:13px;color:#6b7280;">No highlights recorded for this source yet.</p>'}
  </div>
</body>
</html>`;

  const textParts: string[] = [
    `${source.name}${source.author ? ` — ${source.author}` : ''}`,
    `(${highlights.length} highlights)`,
    '='.repeat(40),
    '',
  ];
  if (includeNotes && source.source_notes) {
    textParts.push('SOURCE NOTES:', source.source_notes, '');
  }
  highlights.forEach((h, i) => {
    textParts.push(`${i + 1}. "${h.content}"`);
    if (includeNotes && h.note) textParts.push(`   Note: ${h.note}`);
    if (h.location) textParts.push(`   Location: ${h.location}`);
    textParts.push('');
  });

  return { subject, html, text: textParts.join('\n') };
}

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

export async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as ResendResponse;

  if (!res.ok) {
    throw new Error(data.message || `Resend API error (HTTP ${res.status})`);
  }

  return { id: data.id || 'sent' };
}

export async function getDigestHighlights(
  db: D1Database,
  count: number
): Promise<HighlightWithSource[]> {
  const safeCount = Math.min(20, Math.max(1, count));
  const now = new Date().toISOString();

  const { results: due } = await db
    .prepare(
      `SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url
       FROM highlights h
       JOIN sources s ON s.id = h.source_id
       WHERE h.deleted = 0 AND s.deleted = 0 AND h.is_in_review_queue = 1
         AND (h.next_review_at <= ? OR h.review_count = 0)
       ORDER BY h.next_review_at ASC, RANDOM()
       LIMIT ?`
    )
    .bind(now, safeCount)
    .all<HighlightWithSource>();

  if (due.length >= safeCount) {
    return due;
  }

  const existingIds = new Set(due.map((d) => d.id));

  const { results: extra } = await db
    .prepare(
      `SELECT h.*, s.name as source_name, s.author as source_author, s.type as source_type, s.url as source_url
       FROM highlights h
       JOIN sources s ON s.id = h.source_id
       WHERE h.deleted = 0 AND s.deleted = 0
       ORDER BY RANDOM()
       LIMIT ?`
    )
    .bind(safeCount + 5)
    .all<HighlightWithSource>();

  const combined = [...due];
  for (const item of extra) {
    if (combined.length >= safeCount) break;
    if (!existingIds.has(item.id)) {
      combined.push(item);
      existingIds.add(item.id);
    }
  }

  return combined.slice(0, safeCount);
}

export async function logEmailSend(
  db: D1Database,
  entry: {
    emailType: 'digest' | 'highlight' | 'source';
    recipient: string;
    subject: string;
    status: 'sent' | 'failed';
    errorMessage?: string;
  }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO email_logs (id, email_type, recipient, subject, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        entry.emailType,
        entry.recipient,
        entry.subject,
        entry.status,
        entry.errorMessage || null
      )
      .run();
  } catch (err) {
    console.warn('Failed to log email:', err);
  }
}

export async function runScheduledDigest(
  env: Bindings
): Promise<{ sent: boolean; reason: string; count?: number }> {
  const settings = await getSettings(env.DB);
  if (settings.digest_enabled !== 1) {
    return { sent: false, reason: 'Digest disabled' };
  }
  if (!settings.digest_email) {
    return { sent: false, reason: 'No recipient email configured' };
  }

  const apiKey = settings.resend_api_key || env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'No Resend API key configured' };
  }

  const now = new Date();
  const currentHourUtc = now.getUTCHours();
  const todayUtc = now.toISOString().split('T')[0];

  if (currentHourUtc !== settings.digest_hour_utc) {
    return {
      sent: false,
      reason: `Current UTC hour ${currentHourUtc} != configured ${settings.digest_hour_utc}`,
    };
  }

  if (settings.last_digest_sent_date === todayUtc) {
    return { sent: false, reason: 'Already sent today' };
  }

  const highlights = await getDigestHighlights(env.DB, settings.digest_count || 5);
  if (highlights.length === 0) {
    return { sent: false, reason: 'No highlights in library' };
  }

  const rendered = buildDigestEmail(highlights);
  const from = settings.from_email || 'Mnema Digest <onboarding@resend.dev>';

  try {
    await sendViaResend({
      apiKey,
      from,
      to: settings.digest_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    const sentAt = now.toISOString();
    await env.DB.prepare(
      `UPDATE user_settings SET last_digest_sent_date = ?, last_digest_sent_at = ?, updated_at = ? WHERE id = 'default'`
    )
      .bind(todayUtc, sentAt, sentAt)
      .run();

    await logEmailSend(env.DB, {
      emailType: 'digest',
      recipient: settings.digest_email,
      subject: rendered.subject,
      status: 'sent',
    });

    return { sent: true, reason: 'Sent successfully', count: highlights.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logEmailSend(env.DB, {
      emailType: 'digest',
      recipient: settings.digest_email,
      subject: rendered.subject,
      status: 'failed',
      errorMessage: message,
    });
    return { sent: false, reason: message };
  }
}
