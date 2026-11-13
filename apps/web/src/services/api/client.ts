export const API_BASE = '/api';

export class SessionExpiredError extends Error {
  constructor(message = 'Session expired. Please refresh the page to re-authenticate.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export interface ApiFetchOptions extends RequestInit {
  skipAuthIntercept?: boolean;
}

export async function apiFetch(input: RequestInfo | URL, init?: ApiFetchOptions): Promise<Response> {
  const res = await fetch(input, init);
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : typeof (input as Request)?.url === 'string'
      ? (input as Request).url
      : '';
  const isPublicRoute = urlStr.includes('/api/public/') || urlStr.includes('/public/share/');
  const skipAuth = init?.skipAuthIntercept || isPublicRoute;

  if (!skipAuth) {
    const contentType = res.headers.get('content-type') || '';
    if (
      res.status === 401 ||
      (res.redirected && res.url.includes('cloudflareaccess.com')) ||
      contentType.includes('text/html')
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mnema:session-expired'));
      }
      throw new SessionExpiredError(
        'Cloudflare Access session expired. Please refresh the page to re-authenticate.'
      );
    }
  }
  return res;
}

export async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}
