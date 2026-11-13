import { sourcesApi, BookSearchResult, ImportSummary } from './sources';
import { highlightsApi } from './highlights';
import { reviewsApi } from './reviews';
import { aiApi } from './ai';
import { integrationsApi } from './integrations';

export { SessionExpiredError, apiFetch, API_BASE } from './client';
export type { ApiFetchOptions } from './client';
export type { BookSearchResult, ImportSummary } from './sources';

export const api = {
  ...sourcesApi,
  ...highlightsApi,
  ...reviewsApi,
  ...aiApi,
  ...integrationsApi,
};

export default api;
