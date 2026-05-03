/**
 * BrowsePresenter — View layer for marketplace category browsing.
 *
 * Transforms raw category data into a formatted table with
 * HATEOAS suggestions guiding the agent to search within categories.
 */

import { definePresenter, ui, suggest } from '@vurb/core';
import { CategoryModel } from '../models/CategoryModel.js';

export const BrowsePresenter = definePresenter({
  name: 'BrowseCategories',
  schema: CategoryModel.schema,

  rules: [
    'Categories are sorted by listing count. Higher counts indicate more mature ecosystems.',
    'Use the category label as a "domain" hint in catalog.request_capability for better routing.',
  ],

  collectionUi: (categories: any[]) => [
    ui.summary(`${categories.length} categories available with ${categories.reduce((sum: number, c: any) => sum + c.listing_count, 0)} total servers on Vinkius`),
    ui.table(
      ['Category', 'Available Servers'],
      categories.map((c: any) => [c.label, `${c.listing_count}`]),
    ),
  ],

  collectionSuggestions: () => [
    suggest('catalog.search', 'Search within a specific category to find the right server'),
    suggest('catalog.request_capability', 'Describe what you need — the semantic router finds the best match automatically'),
  ],

  agentLimit: {
    max: 50,
    onTruncate: (n: number) => ui.summary(`${n} additional categories omitted.`),
  },
});
