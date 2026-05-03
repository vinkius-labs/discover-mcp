/**
 * SubscriptionModel — Domain model for active MCP subscriptions.
 *
 * Represents a user's active server subscription with usage analytics.
 * Used by AnalyticsPresenter for RBAC-aware rendering.
 */

import { defineModel } from '@vurb/core';

export const SubscriptionModel = defineModel('Subscription', m => {
  m.casts({
    subscription_id: m.string('Subscription UUID'),
    title:           m.string('Server display name'),
    slug:            m.string('Server slug'),
    status:          m.enum('Subscription status', ['active', 'paused', 'cancelled', 'expired']),
    started_at:      m.timestamp('Subscription start date'),
    request_count:   m.number('Total API calls made'),
    last_used_at:    m.timestamp('Last tool invocation timestamp'),
  });
});
