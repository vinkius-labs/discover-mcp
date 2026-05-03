/**
 * ActiveServerModel — Domain model for the SLIM tool index.
 *
 * Represents a server entry with tool names only (no descriptions
 * or inputSchemas). Used by ToolsPresenter for compact discovery.
 *
 * For full tool details, use catalog.inspect → CatalogToolSchemaResponse.
 */

import { defineModel } from '@vurb/core';

export const ActiveServerModel = defineModel('ActiveServer', m => {
  m.casts({
    slug:              m.string('Server slug'),
    listing_id:        m.string('Listing UUID'),
    title:             m.string('Server display name'),
    short_description: m.string('Server description'),
    tool_count:        m.number('Number of available tools'),
    tools:             m.list('Tool names (name only)', {
      name: m.string('Tool name (e.g., "github__create_issue")'),
    }),
  });
});
