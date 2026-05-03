/**
 * Type definitions for the Vinkius MCP Catalog gateway.
 */

/** A single tool definition as returned by the Vinkius AI Gateway API. */
export interface CatalogTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Slim tool entry — name only, used in the optimized tools index. */
export interface SlimCatalogTool {
  name: string;
}

/** A server entry in the SLIM tools index (no descriptions/schemas). */
export interface SlimCatalogServer {
  slug: string;
  listing_id: string;
  title: string;
  short_description: string;
  icon_url: string | null;
  tool_count: number;
  tools: SlimCatalogTool[];
}

/** Response from GET /catalog/tools (always slim, paginated). */
export interface CatalogToolsResponse {
  servers: SlimCatalogServer[];
  total_servers: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

/** Response from GET /catalog/tools/:tool_name/schema (single tool detail). */
export interface CatalogToolSchemaResponse {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  server_slug: string;
  server_title: string;
}

/** @deprecated Full server manifest — only used internally by proxy tools. */
export interface CatalogServer {
  slug: string;
  listing_id: string;
  title: string;
  short_description: string;
  icon_url: string | null;
  tools: CatalogTool[];
}

/** Response from POST /catalog/execute */
export interface CatalogExecuteResponse {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

/** A search result listing. */
export interface CatalogSearchResult {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  listing_type: string;
  publisher_type: string;
  avg_rating: number | null;
  tags: string[];
  categories: string[];
  icon_url: string | null;
  top_tools: Array<{ name: string; description: string }>;
  action: string;
}

/** Response from GET /catalog/search */
export interface CatalogSearchResponse {
  results: CatalogSearchResult[];
  total: number;
  hint: string;
}

/** Response from POST /catalog/activate */
export interface CatalogActivateResponse {
  activated: boolean;
  subscription_id?: string;
  checkout_url?: string;
  message: string;
}

/** Response from GET /catalog/browse */
export interface CatalogBrowseResponse {
  categories: Array<{
    slug: string;
    label: string;
    listing_count: number;
  }>;
}

/** Response from GET /catalog/analytics */
export interface CatalogAnalyticsResponse {
  subscriptions: Array<{
    subscription_id: string;
    title: string;
    slug: string;
    status: string;
    started_at: string;
    request_count: number;
    last_used_at: string | null;
  }>;
}
