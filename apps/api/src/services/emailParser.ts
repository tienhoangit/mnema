export interface ParsedNewsletterEmail {
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sanitizeNewsletterHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/<applet\b[\s\S]*?<\/applet>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(\b(?:href|src|action|formaction)\s*=\s*)(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|[^\s>]*\b(?:javascript|vbscript):[^\s>]*)/gi, '$1"#"');
}

function parseFromHeader(fromRaw: string | null): { name: string | null; email: string | null } {
  if (!fromRaw) return { name: null, email: null };
  const trimmed = fromRaw.trim();
  const angleMatch = trimmed.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (angleMatch) {
    return {
      name: angleMatch[1].trim() || null,
      email: angleMatch[2].trim() || null,
    };
  }
  if (trimmed.includes('@')) {
    return { name: trimmed.split('@')[0], email: trimmed };
  }
  return { name: trimmed, email: null };
}

function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff);
    }
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return joined;
  }
}

function decodeBase64Utf8(input: string): string {
  const cleaned = input.replace(/\s+/g, '');
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return input;
  }
}

function decodeMimeWord(val: string): string {
  return val.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_, _charset, enc: string, text: string) => {
    if (enc.toUpperCase() === 'B') {
      return decodeBase64Utf8(text);
    }
    return decodeQuotedPrintable(text.replace(/_/g, ' '));
  });
}

function parseHeadersAndBody(raw: string): { headers: Map<string, string>; body: string } {
  const splitIdx = raw.search(/\r?\n\r?\n/);
  if (splitIdx === -1) {
    return { headers: new Map(), body: raw };
  }
  const headerBlock = raw.slice(0, splitIdx);
  const bodyStart = raw.slice(splitIdx).match(/^\r?\n\r?\n/)?.[0].length || 2;
  const body = raw.slice(splitIdx + bodyStart);

  // Unfold folded headers
  const unfolded = headerBlock.replace(/\r?\n([ \t]+)/g, ' ');
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = decodeMimeWord(line.slice(colon + 1).trim());
      headers.set(key, value);
    }
  }

  return { headers, body };
}

function extractMimeParts(raw: string): { html: string; text: string; headers: Map<string, string> } {
  const { headers, body } = parseHeadersAndBody(raw);
  const contentType = headers.get('content-type') || 'text/plain';
  const encoding = (headers.get('content-transfer-encoding') || '').toLowerCase();

  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const segments = body.split(`--${boundary}`);
    let html = '';
    let text = '';

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed || trimmed === '--') continue;
      const sub = extractMimeParts(seg.replace(/^\r?\n/, ''));
      if (sub.html && !html) html = sub.html;
      if (sub.text && !text) text = sub.text;
    }
    return { html, text, headers };
  }

  let decoded = body;
  if (encoding.includes('quoted-printable')) {
    decoded = decodeQuotedPrintable(body);
  } else if (encoding.includes('base64')) {
    decoded = decodeBase64Utf8(body);
  }

  if (contentType.toLowerCase().includes('text/html')) {
    return { html: decoded, text: '', headers };
  }
  return { html: '', text: decoded, headers };
}

export function textToHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  return paragraphs || '<p></p>';
}

export function parseIncomingNewsletter(
  payload: string | Record<string, unknown>
): ParsedNewsletterEmail {
  if (typeof payload === 'string') {
    const { html, text, headers } = extractMimeParts(payload);
    const fromParsed = parseFromHeader(headers.get('from') || null);
    const subject = headers.get('subject') || 'Newsletter Article';
    const cleanHtml = html ? sanitizeNewsletterHtml(html) : textToHtml(text);
    const plainText = text || cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      fromName: fromParsed.name,
      fromEmail: fromParsed.email,
      subject,
      html: cleanHtml,
      text: plainText,
    };
  }

  if (typeof payload.raw === 'string' && payload.raw.trim()) {
    const parsedRaw = parseIncomingNewsletter(payload.raw);
    return {
      fromName:
        typeof payload.fromName === 'string' && payload.fromName
          ? payload.fromName
          : parsedRaw.fromName,
      fromEmail:
        typeof payload.fromEmail === 'string' && payload.fromEmail
          ? payload.fromEmail
          : parsedRaw.fromEmail,
      subject:
        typeof payload.subject === 'string' && payload.subject
          ? payload.subject
          : parsedRaw.subject,
      html: parsedRaw.html,
      text: parsedRaw.text,
    };
  }

  const rawFrom =
    typeof payload.from === 'string'
      ? payload.from
      : typeof payload.sender === 'string'
      ? payload.sender
      : null;
  const fromParsed = parseFromHeader(rawFrom);
  const subject =
    (typeof payload.subject === 'string' && payload.subject.trim()) ||
    (typeof payload.title === 'string' && payload.title.trim()) ||
    'Newsletter Issue';

  const rawHtml = typeof payload.html === 'string' ? payload.html.trim() : '';
  const rawText = typeof payload.text === 'string' ? payload.text.trim() : '';

  const html = rawHtml ? sanitizeNewsletterHtml(rawHtml) : textToHtml(rawText);
  const text =
    rawText || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    fromName:
      (typeof payload.fromName === 'string' && payload.fromName.trim()) ||
      fromParsed.name,
    fromEmail: fromParsed.email,
    subject,
    html,
    text,
  };
}
