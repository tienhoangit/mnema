import { ExtensionConfig, DEFAULT_CONFIG } from '@mnema/shared';
export type { ExtensionConfig };
export { DEFAULT_CONFIG };

export async function getConfig(): Promise<ExtensionConfig> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return DEFAULT_CONFIG;
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['mnema_api_url', 'mnema_api_token', 'mnema_cf_access_client_id', 'mnema_cf_access_client_secret'],
      (items: Record<string, any>) => {
        const rawUrl =
          items && typeof items.mnema_api_url === 'string' && items.mnema_api_url.trim()
            ? items.mnema_api_url.trim()
            : DEFAULT_CONFIG.apiUrl;
        const rawToken = items && typeof items.mnema_api_token === 'string' ? items.mnema_api_token.trim() : '';
        const rawCfClientId =
          items && typeof items.mnema_cf_access_client_id === 'string' ? items.mnema_cf_access_client_id.trim() : '';
        const rawCfClientSecret =
          items && typeof items.mnema_cf_access_client_secret === 'string'
            ? items.mnema_cf_access_client_secret.trim()
            : '';
        resolve({
          apiUrl: rawUrl.replace(/\/+$/, ''),
          apiToken: rawToken,
          cfAccessClientId: rawCfClientId,
          cfAccessClientSecret: rawCfClientSecret,
        });
      }
    );
  });
}

export async function saveConfig(config: Partial<ExtensionConfig>): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const updates: Record<string, string> = {};
  if (config.apiUrl !== undefined) updates.mnema_api_url = config.apiUrl.replace(/\/+$/, '');
  if (config.apiToken !== undefined) updates.mnema_api_token = config.apiToken;
  if (config.cfAccessClientId !== undefined) updates.mnema_cf_access_client_id = config.cfAccessClientId;
  if (config.cfAccessClientSecret !== undefined) updates.mnema_cf_access_client_secret = config.cfAccessClientSecret;
  return new Promise<void>((resolve) => {
    chrome.storage.local.set(updates, () => resolve());
  });
}

export function buildAuthHeaders(config: ExtensionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiToken = config.apiToken?.trim();
  const cfAccessClientId = config.cfAccessClientId?.trim();
  const cfAccessClientSecret = config.cfAccessClientSecret?.trim();
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
    headers['X-Api-Key'] = apiToken;
  }
  if (cfAccessClientId) {
    headers['CF-Access-Client-Id'] = cfAccessClientId;
  }
  if (cfAccessClientSecret) {
    headers['CF-Access-Client-Secret'] = cfAccessClientSecret;
  }
  return headers;
}

export async function assertJsonApiResponse(res: Response): Promise<void> {
  const contentType = res.headers.get('content-type') || '';
  if (
    res.status === 302 ||
    (res.redirected && res.url.includes('cloudflareaccess.com')) ||
    contentType.includes('text/html')
  ) {
    throw new Error(
      'Cloudflare Access authentication required (HTML/302 redirect). Please sign in via browser or configure CF-Access Service Token in extension Settings.'
    );
  }
}
