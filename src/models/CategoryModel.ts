/**
 * CategoryModel — Domain model for marketplace category listings.
 *
 * Represents a single browsable MCP category with server count.
 * Used by BrowsePresenter to validate and shape category data.
 */

import { defineModel } from '@vurb/core';

export const CategoryModel = defineModel('Category', m => {
  m.casts({
    slug:          m.string('Category identifier'),
    label:         m.string('Human-readable category name'),
    listing_count: m.number('Number of servers in this category'),
  });
});
