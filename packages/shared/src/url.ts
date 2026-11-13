/**
 * Validates and sanitizes URLs to prevent XSS and open redirects (e.g. javascript:, data:, vbscript:, //evil.com, /\evil.com)
 */
export function getSafeHttpUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Reject URLs with control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    // Relative path check: must start with / and not contain backslashes or protocol-relative //
    if (
      trimmed.startsWith('/') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/\\') &&
      !trimmed.includes('\\')
    ) {
      return trimmed;
    }
  }
  return null;
}

export function safeUrl(raw?: string | null, fallback: string = '#'): string {
  return getSafeHttpUrl(raw) || fallback;
}

export function isSafeUrl(raw?: string | null): boolean {
  return getSafeHttpUrl(raw) !== null;
}
