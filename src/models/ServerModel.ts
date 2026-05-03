/**
 * ServerModel — Domain model for MCP marketplace server listings.
 *
 * Defines the canonical shape of a server entry returned by the
 * Vinkius API, used by SearchPresenter and CapabilityPresenter
 * to validate and shape responses before they reach the LLM.
 */

import { defineModel } from '@vurb/core';

export const ServerModel = defineModel('Server', m => {
  m.casts({
    id:                m.string('Listing UUID for activation'),
    slug:              m.string('URL-safe identifier'),
    title:             m.string('Server display name'),
    short_description: m.string('One-line server description'),
    listing_type:      m.string('Listing type (free, paid)'),
    publisher_type:    m.string('Publisher type (official, community)'),
    avg_rating:        m.number('Average user rating (1-5)'),
    tags:              m.list('Capability tags', {
      name: m.string('Tag name'),
    }),
    categories:        m.list('Server categories', {
      name: m.string('Category name'),
    }),
    icon_url:          m.string('Server icon URL'),
    action:            m.string('Activation action (subscribe, checkout)'),
    top_tools:         m.list('Top available tools', {
      name:        m.string('Tool name'),
      description: m.string('Tool description'),
    }),
  });

  m.hidden(['icon_url']);
});
