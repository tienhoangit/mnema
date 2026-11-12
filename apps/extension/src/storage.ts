export interface ExtensionConfig {
  apiUrl: string;
  apiToken: string;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  apiUrl: 'http://127.0.0.1:8787',
  apiToken: '',
};

export async function getConfig(): Promise<ExtensionConfig> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return DEFAULT_CONFIG;
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(['mnema_api_url', 'mnema_api_token'], (items: Record<string, any>) => {
      const rawUrl = items && typeof items.mnema_api_url === 'string' ? items.mnema_api_url : DEFAULT_CONFIG.apiUrl;
      const rawToken = items && typeof items.mnema_api_token === 'string' ? items.mnema_api_token : '';
      resolve({
        apiUrl: rawUrl.replace(/\/+$/, ''),
        apiToken: rawToken,
      });
    });
  });
}

export async function saveConfig(config: Partial<ExtensionConfig>): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const updates: Record<string, string> = {};
  if (config.apiUrl !== undefined) updates.mnema_api_url = config.apiUrl.replace(/\/+$/, '');
  if (config.apiToken !== undefined) updates.mnema_api_token = config.apiToken;
  return new Promise<void>((resolve) => {
    chrome.storage.local.set(updates, () => resolve());
  });
}
