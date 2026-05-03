/**
 * RankedServerModel — Domain model for semantic routing results.
 *
 * Represents a server scored by the hierarchical semantic router
 * with relevance scoring and matching tools. Used by CapabilityPresenter.
 */

import { defineModel } from '@vurb/core';

export const RankedServerModel = defineModel('RankedServer', m => {
  m.casts({
    title:             m.string('Server name'),
    slug:              m.string('Server slug'),
    id:                m.string('Listing UUID for activation'),
    short_description: m.string('Server description'),
    overall_score:     m.number('Relevance score (0-1)'),
    category_score:    m.number('Category match score (0-1)'),
    action:            m.string('Activation type'),
    top_matching_tools: m.list('Best matching tools', {
      name:        m.string('Tool name'),
      description: m.string('Tool description'),
      relevance:   m.number('Tool relevance score'),
    }),
  });
});
