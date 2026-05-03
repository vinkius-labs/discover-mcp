/**
 * HTTP client for the Vinkius AI Gateway Catalog API.
 *
 * All requests are authenticated with the vk_catalog_* Bearer token.
 * The base URL defaults to the production API but can be overridden
 * via the VINKIUS_API_URL environment variable.
 *
 * Production hardening:
 *   - 30s AbortController timeout prevents indefinite hangs
 *   - Structured error messages with method + path context
 *   - Graceful response.text() fallback on broken streams
 *   - Auth errors (401/403) are classified as non-retryable with clear user guidance
 */

import type {
  CatalogToolsResponse,
  CatalogToolSchemaResponse,
  CatalogExecuteResponse,
  CatalogSearchResponse,
  CatalogActivateResponse,
  CatalogBrowseResponse,
  CatalogAnalyticsResponse,
} from '../types.js';

const DEFAULT_API_URL = 'https://api.vinkius.com';

/** Default request timeout in milliseconds (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Structured API error with HTTP status context.
 *
 * Differentiates between:
 * - Auth errors (401/403): non-retryable, user must fix their token
 * - Server errors (5xx): transient, retryable
 * - Client errors (4xx): usually non-retryable, user action needed
 */
export class CatalogApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly retryable: boolean;
  readonly userGuidance: string;

  constructor(status: number, method: string, path: string, body: string) {
    const tag = `[catalog/${path.split('/').pop() ?? 'unknown'}]`;

    if (status === 401 || status === 403) {
      super(
        `${tag} Authentication failed (HTTP ${status}).\n\n` +
        'Your VINKIUS_CATALOG_TOKEN is invalid or expired.\n\n' +
        'To fix this:\n' +
        '  1. Go to https://cloud.vinkius.com/settings/catalog-tokens\n' +
        '  2. Create a new catalog token (starts with vk_catalog_)\n' +
        '  3. Update your MCP client configuration with the new token\n' +
        '  4. Restart your AI agent',
      );
      this.retryable = false;
      this.userGuidance =
        'STOP. Do NOT retry this request. ' +
        'Inform the user that their catalog token is invalid or expired and they need to generate a new one at https://cloud.vinkius.com/settings/catalog-tokens';
    } else if (status >= 500) {
      super(
        `${tag} Vinkius API ${method} ${path} returned ${status}: ${body}`,
      );
      this.retryable = true;
      this.userGuidance = 'This may be a transient error. Retry the same call with identical parameters.';
    } else {
      super(
        `${tag} Vinkius API ${method} ${path} returned ${status}: ${body}`,
      );
      this.retryable = false;
      this.userGuidance = 'This request cannot be completed. Check the parameters and try again with corrected values.';
    }

    this.name = 'CatalogApiError';
    this.status = status;
    this.method = method;
    this.path = path;
  }
}

export class VinkiusClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(token: string, baseUrl?: string, timeoutMs?: number) {
    this.token = token;
    this.baseUrl = (baseUrl ?? DEFAULT_API_URL).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** GET /catalog/tools — Slim, paginated tool index (names only, no schemas). */
  async getTools(page = 1): Promise<CatalogToolsResponse> {
    const params = page > 1 ? `?page=${page}` : '';
    return this.request<CatalogToolsResponse>('GET', `/catalog/tools${params}`);
  }

  /** GET /catalog/tools/:toolName/schema — Full schema for a single tool. */
  async getToolSchema(toolName: string): Promise<CatalogToolSchemaResponse> {
    return this.request<CatalogToolSchemaResponse>(
      'GET',
      `/catalog/tools/${encodeURIComponent(toolName)}/schema`,
    );
  }

  /** POST /catalog/execute — Route execution to correct upstream server. */
  async execute(toolName: string, args: Record<string, unknown>): Promise<CatalogExecuteResponse> {
    return this.request<CatalogExecuteResponse>('POST', '/catalog/execute', {
      tool_name: toolName,
      arguments: args,
    });
  }

  /** GET /catalog/search — Smart search with synonym expansion. */
  async search(query: string, limit = 15): Promise<CatalogSearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return this.request<CatalogSearchResponse>('GET', `/catalog/search?${params}`);
  }

  /** POST /catalog/activate — Subscribe to a listing. */
  async activate(listingId: string): Promise<CatalogActivateResponse> {
    return this.request<CatalogActivateResponse>('POST', '/catalog/activate', {
      listing_id: listingId,
    });
  }

  /** POST /catalog/deactivate — Unsubscribe from a listing. */
  async deactivate(subscriptionId: string): Promise<{ deactivated: boolean }> {
    return this.request<{ deactivated: boolean }>('POST', '/catalog/deactivate', {
      subscription_id: subscriptionId,
    });
  }

  /** GET /catalog/browse — Browse categories. */
  async browse(): Promise<CatalogBrowseResponse> {
    return this.request<CatalogBrowseResponse>('GET', '/catalog/browse');
  }

  /** GET /catalog/analytics — Usage insights. */
  async analytics(): Promise<CatalogAnalyticsResponse> {
    return this.request<CatalogAnalyticsResponse>('GET', '/catalog/analytics');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'User-Agent': '@vinkius-core/discover-mcp',
    };

    const init: RequestInit = { method, headers };

    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    // AbortController with timeout prevents indefinite hangs
    // when the Vinkius API is unresponsive or degraded.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;

    try {
      const response = await fetch(url, init);

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new CatalogApiError(response.status, method, path, text);
      }

      return response.json() as Promise<T>;
    } catch (err: unknown) {
      // Translate AbortError into a clear timeout message
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CatalogApiError(408, method, path, `Request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
