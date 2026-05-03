/**
 * Hierarchical Semantic Router — Capability Discovery Engine.
 *
 * Implements a two-stage routing algorithm that transforms flat API searches
 * into a structured capability discovery pipeline:
 *
 *   Stage 1 — Category Filtering
 *     Narrows the search space by matching domain hints against catalog categories.
 *
 *   Stage 2 — Search + Tool Ranking
 *     Searches the catalog with an optimized query, then scores individual tools
 *     within matched servers by keyword similarity to the capability request.
 *
 * All routing runs client-side. No new backend endpoints required.
 */

import type { VinkiusClient } from '../api/client.js';
import type { CatalogSearchResult } from '../types.js';
import type { CapabilityGraph } from './capability-graph.js';

// ── Types ───────────────────────────────────────────────────────────────────

/** Structured capability request — the input the LLM generates. */
export interface CapabilityRequest {
  capability: string;
  inputHints?: Record<string, string>;
  outputHints?: string;
  domain?: string;
}

/** A search result enriched with hierarchical scoring (engine-internal). */
export interface RankedServer {
  server: CatalogSearchResult;
  categoryScore: number;
  toolScores: Array<{ name: string; description: string; score: number }>;
  overallScore: number;
}

/** A ranked server shaped for the RankedServerModel Presenter. */
export interface RoutingServer {
  title: string;
  slug: string;
  id: string;
  short_description: string;
  overall_score: number;
  category_score: number;
  action: string | null;
  top_matching_tools: Array<{ name: string; description: string; relevance: number }>;
}

/** Full output of the routing pipeline. */
export interface RoutingResult {
  servers: RoutingServer[];
  matchedCategories: string[];
  query: string;
  sessionContext: string;
}

// ── Text Processing ─────────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from text — multilingual.
 *
 * Uses Unicode-aware regex (\p{L} = any letter, \p{N} = any digit)
 * to preserve accented characters across EN, ES, PT, FR:
 *   inflação → inflação ✓  (not "infla o")
 *   información → información ✓
 *   données → données ✓
 *
 * Minimum word-length filter (3+ chars) removes most noise
 * across all languages (articles, prepositions).
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/** Jaccard similarity between two keyword arrays (0–1). */
export function similarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Query Building ──────────────────────────────────────────────────────────

/**
 * Compose an optimized search query from a structured capability request.
 *
 * Tokenizes all fields to extract keywords — the API does full-text search,
 * so sending raw sentences ("I need to fetch...") returns poor results.
 * Keywords ("CPI inflation time-series economics") match much better.
 */
export function buildQuery(request: CapabilityRequest): string {
  // Extract keywords from the natural language capability description
  const keywords = tokenize(request.capability);

  if (request.domain) {
    keywords.push(...tokenize(request.domain));
  }

  if (request.inputHints) {
    // Input hint keys are already keyword-shaped (e.g., "series_id")
    keywords.push(...Object.keys(request.inputHints));
  }

  if (request.outputHints) {
    keywords.push(...tokenize(request.outputHints));
  }

  // Deduplicate to avoid noise in the API query
  return [...new Set(keywords)].join(' ');
}

// ── Stage 1: Category Filtering ─────────────────────────────────────────────

/** Match a domain hint against category labels. Returns matching category slugs. */
export function matchCategories(
  domain: string,
  categories: Array<{ slug: string; label: string }>,
): string[] {
  const domainTokens = tokenize(domain);
  const matched: Array<{ slug: string; score: number }> = [];

  for (const cat of categories) {
    const catTokens = tokenize(cat.label);
    const jaccardScore = similarity(domainTokens, catTokens);

    // Substring boost: "economics" matches "Economic Intelligence"
    const labelLower = cat.label.toLowerCase();
    const domainLower = domain.toLowerCase();
    const substringBoost =
      labelLower.includes(domainLower) || domainLower.includes(labelLower)
        ? 0.3
        : 0;

    const finalScore = jaccardScore + substringBoost;
    if (finalScore > 0) {
      matched.push({ slug: cat.slug, score: finalScore });
    }
  }

  return matched
    .sort((a, b) => b.score - a.score)
    .map(m => m.slug);
}

// ── Stage 2: Search + Tool Ranking ──────────────────────────────────────────

/** Normalize a category label to its slug form for comparison. */
function toSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // strip &, @, etc.
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')               // collapse consecutive hyphens
    .replace(/^-|-$/g, '');            // trim leading/trailing hyphens
}

/** Score and rank search results using hierarchical criteria. */
export function rankResults(
  results: CatalogSearchResult[],
  request: CapabilityRequest,
  matchedCategorySlugs: string[],
): RankedServer[] {
  // buildQuery() already returns deduplicated keywords — split, don't re-tokenize
  const requestTokens = buildQuery(request).split(' ').filter(w => w.length > 0);

  return results
    .map(server => {
      // Category match score (Stage 1 signal)
      const categoryScore =
        matchedCategorySlugs.length > 0
          ? server.categories.some(c => matchedCategorySlugs.includes(toSlug(c)))
            ? 1.0
            : 0.0
          : 0.5; // No domain filter → neutral

      // Tool-level scoring (Stage 2 signal)
      const toolScores = (server.top_tools || [])
        .map(tool => {
          const toolTokens = tokenize(`${tool.name} ${tool.description}`);
          return {
            name: tool.name,
            description: tool.description,
            score: similarity(requestTokens, toolTokens),
          };
        })
        .sort((a, b) => b.score - a.score);

      const bestToolScore = toolScores.length > 0 ? toolScores[0].score : 0;

      // Server-level text match
      const serverTokens = tokenize(`${server.title} ${server.short_description}`);
      const serverScore = similarity(requestTokens, serverTokens);

      // Weighted composite: category 30% + best tool 40% + server text 30%
      const overallScore =
        categoryScore * 0.3 + bestToolScore * 0.4 + serverScore * 0.3;

      return { server, categoryScore, toolScores, overallScore };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}

// ── Full Pipeline ───────────────────────────────────────────────────────────

/**
 * Execute the full hierarchical routing pipeline.
 *
 * Stage 1: domain hint → browse categories → filter
 * Stage 2: build query → search → rank by category + tool similarity
 */
export async function route(
  client: VinkiusClient,
  request: CapabilityRequest,
  graph?: CapabilityGraph,
): Promise<RoutingResult> {
  // Stage 1: Category filtering (only if domain hint provided)
  let matchedCategorySlugs: string[] = [];

  if (request.domain) {
    try {
      const { categories } = await client.browse();
      matchedCategorySlugs = matchCategories(request.domain, categories);
    } catch {
      // Non-fatal: proceed without category filtering
    }
  }

  // Build optimized query from structured request
  const query = buildQuery(request);

  // Stage 2: Search + hierarchical ranking
  const searchResults = await client.search(query, 15);
  const rankedServers = rankResults(
    searchResults.results,
    request,
    matchedCategorySlugs,
  );

  // Enrich with session context from capability graph
  const sessionContext = graph?.getSessionContext() ?? '';

  // Map to Model-shaped output — handlers return this directly
  const servers: RoutingServer[] = rankedServers.slice(0, 10).map(rs => ({
    title: rs.server.title,
    slug: rs.server.slug,
    id: rs.server.id,
    short_description: rs.server.short_description,
    overall_score: Math.round(rs.overallScore * 100) / 100,
    category_score: Math.round(rs.categoryScore * 100) / 100,
    action: rs.server.action ?? null,
    top_matching_tools: rs.toolScores.slice(0, 5).map(t => ({
      name: t.name,
      description: t.description,
      relevance: Math.round(t.score * 100) / 100,
    })),
  }));

  return { servers, matchedCategories: matchedCategorySlugs, query, sessionContext };
}
