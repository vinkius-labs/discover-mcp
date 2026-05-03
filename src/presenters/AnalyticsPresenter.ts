/**
 * AnalyticsPresenter — View layer for subscription usage analytics.
 *
 * Renders usage data as structured tables with dynamic system rules
 * that highlight inactive subscriptions and suggest cleanup actions.
 */

import { definePresenter, ui, suggest } from '@vurb/core';
import { SubscriptionModel } from '../models/SubscriptionModel.js';

export const AnalyticsPresenter = definePresenter({
  name: 'Analytics',
  schema: SubscriptionModel.schema,

  rules: (sub: any) => [
    sub.status !== 'active'
      ? `⚠️ Subscription "${sub.title}" is ${sub.status}. It may need attention.`
      : null,
    sub.request_count === 0
      ? `💡 "${sub.title}" has never been used. Consider deactivating to keep context clean.`
      : null,
  ],

  collectionUi: (subs: any[]) => {
    const active = subs.filter((s: any) => s.status === 'active').length;
    const totalCalls = subs.reduce((sum: number, s: any) => sum + s.request_count, 0);

    return [
      ui.summary(`${active} active subscription(s), ${totalCalls.toLocaleString()} total API calls`),
      ui.table(
        ['Server', 'Status', 'Calls', 'Last Used'],
        subs.map((s: any) => [
          s.title,
          s.status === 'active' ? '✅ Active' : `⚠️ ${s.status}`,
          `${s.request_count}`,
          s.last_used_at ?? 'Never',
        ]),
      ),
    ];
  },

  collectionSuggestions: (subs: any[]) => {
    const unused = subs.filter((s: any) => s.request_count === 0 && s.status === 'active');
    return [
      unused.length > 0
        ? suggest('catalog.deactivate', `${unused.length} active subscription(s) have zero usage — consider deactivating to reduce noise`)
        : null,
      suggest('catalog.tools', 'View available tools from active subscriptions'),
    ];
  },

  agentLimit: {
    max: 100,
    onTruncate: (n: number) => ui.summary(`${n} additional subscription(s) omitted. Use catalog.deactivate to clean up unused servers.`),
  },
});
