export interface ExtensionConfig {
  apiUrl: string;
  apiToken: string;
  cfAccessClientId: string;
  cfAccessClientSecret: string;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  apiUrl: 'http://127.0.0.1:8787',
  apiToken: '',
  cfAccessClientId: '',
  cfAccessClientSecret: '',
};

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
