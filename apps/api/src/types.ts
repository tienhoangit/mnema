export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Bindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  AI?: WorkersAiBinding;
  VECTORIZE?: Vectorize;
  EPUB_BUCKET?: R2Bucket;
  GEMINI_API_KEY?: string;
  RESEND_API_KEY?: string;
  OAUTH_KV?: KVNamespace;
  MCP_PIN?: string;
  MCP_PIN_HASH?: string;
  AUTH_PIN_HASH?: string;
  REQUIRE_MCP_AUTH?: string;
  ALLOW_UNAUTH_MCP?: string;
  REQUIRE_API_KEY?: string;
  PUBLIC_ORIGIN?: string;
}

export type Env = Bindings;

export * from '@mnema/shared';
