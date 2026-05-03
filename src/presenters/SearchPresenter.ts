/**
 * SearchPresenter — View layer for marketplace search results.
 *
 * Transforms raw API search results into a structured, agent-friendly
 * response with:
 * - Markdown table of matching servers
 * - HATEOAS suggestions guiding the agent to activate the best match
 * - Agent limit to prevent context flooding on broad queries
 * - System rules teaching the LLM how to interpret ratings and actions
 */

import { definePresenter, ui, suggest } from '@vurb/core';
import { ServerModel } from '../models/ServerModel.js';

export const SearchPresenter = definePresenter({
  name: 'SearchResults',
  schema: ServerModel.schema,

  rules: [
    'Results are ranked by relevance. Higher-rated servers are more reliable.',
    'The "id" field is the listing UUID — use it with catalog.activate to enable a server.',
    'The "action" field indicates activation type: "subscribe" is free and instant, "checkout" requires the user to open a URL.',
    'Show the top 3 most relevant results to the user. Only mention more if asked.',
    '⚠️ The "Top Tools" shown here are PREVIEW names only. After activation, you MUST call catalog.tools to get exact callable tool names.',
  ],

  collectionUi: (servers: any[]) => [
    ui.table(
      ['Server', 'Rating', 'Type', 'Top Tools'],
      servers.map(s => [
        s.title,
        s.avg_rating ? `⭐ ${s.avg_rating}` : '—',
        s.action === 'subscribe' ? '🆓 Free' : '💳 Paid',
        (s.top_tools ?? []).slice(0, 3).map((t: any) => t.name).join(', ') || '—',
      ]),
    ),
  ],

  collectionSuggestions: (servers: any[]) => [
    servers.length > 0
      ? suggest('catalog.activate', 'Activate the best matching server to gain access to its tools')
      : suggest('catalog.browse', 'Browse marketplace categories to discover available servers'),
  ],

  agentLimit: {
    max: 15,
    onTruncate: (n: number) => ui.summary(`${n} additional result(s) omitted. Refine your search query for more specific results.`),
  },
});
