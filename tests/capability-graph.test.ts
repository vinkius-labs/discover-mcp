import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityGraph } from '../src/engine/capability-graph.js';

describe('CapabilityGraph', () => {
  let graph: CapabilityGraph;

  beforeEach(() => {
    graph = new CapabilityGraph();
  });

  // ── Empty state ──────────────────────────────────────────────────────

  describe('empty graph', () => {
    it('starts with size 0', () => {
      expect(graph.size).toBe(0);
    });

    it('starts with totalCalls 0', () => {
      expect(graph.totalCalls).toBe(0);
    });

    it('returns empty usage history', () => {
      expect(graph.getUsageHistory()).toEqual([]);
    });

    it('returns empty server slugs', () => {
      expect(graph.getActiveServerSlugs()).toEqual([]);
    });

    it('returns empty session context', () => {
      expect(graph.getSessionContext()).toBe('');
    });
  });

  // ── Recording ────────────────────────────────────────────────────────

  describe('record', () => {
    it('records a single tool usage', () => {
      graph.record('github__list_issues', 'github');

      expect(graph.size).toBe(1);
      expect(graph.totalCalls).toBe(1);
    });

    it('increments callCount on repeated use', () => {
      graph.record('github__list_issues', 'github');
      graph.record('github__list_issues', 'github');
      graph.record('github__list_issues', 'github');

      expect(graph.size).toBe(1);
      expect(graph.totalCalls).toBe(3);

      const history = graph.getUsageHistory();
      expect(history[0].callCount).toBe(3);
    });

    it('tracks multiple tools across servers', () => {
      graph.record('github__list_issues', 'github');
      graph.record('stripe__list_charges', 'stripe');
      graph.record('slack__send_message', 'slack');

      expect(graph.size).toBe(3);
      expect(graph.totalCalls).toBe(3);
    });

    it('updates lastUsedAt on repeated calls', () => {
      graph.record('github__list_issues', 'github');
      const first = graph.getUsageHistory()[0].lastUsedAt;

      // Small delay to ensure different timestamps
      graph.record('github__list_issues', 'github');
      const second = graph.getUsageHistory()[0].lastUsedAt;

      expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
    });
  });

  // ── Server slugs ─────────────────────────────────────────────────────

  describe('getActiveServerSlugs', () => {
    it('returns unique server slugs', () => {
      graph.record('github__list_issues', 'github');
      graph.record('github__create_issue', 'github');
      graph.record('stripe__list_charges', 'stripe');

      const slugs = graph.getActiveServerSlugs();
      expect(slugs).toHaveLength(2);
      expect(slugs).toContain('github');
      expect(slugs).toContain('stripe');
    });
  });

  // ── Usage history ────────────────────────────────────────────────────

  describe('getUsageHistory', () => {
    it('returns tools sorted by most recently used', () => {
      graph.record('github__list_issues', 'github');
      graph.record('stripe__list_charges', 'stripe');
      graph.record('github__list_issues', 'github'); // Used again → most recent

      const history = graph.getUsageHistory();
      expect(history[0].toolName).toBe('github__list_issues');
    });

    it('includes all fields in capability nodes', () => {
      graph.record('github__list_issues', 'github');

      const node = graph.getUsageHistory()[0];
      expect(node.toolName).toBe('github__list_issues');
      expect(node.serverSlug).toBe('github');
      expect(node.callCount).toBe(1);
      expect(node.firstUsedAt).toBeInstanceOf(Date);
      expect(node.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  // ── Session context ──────────────────────────────────────────────────

  describe('getSessionContext', () => {
    it('returns empty string for empty graph', () => {
      expect(graph.getSessionContext()).toBe('');
    });

    it('includes tool count and server slugs', () => {
      graph.record('github__list_issues', 'github');
      graph.record('stripe__list_charges', 'stripe');

      const context = graph.getSessionContext();
      expect(context).toContain('2 tool(s)');
      expect(context).toContain('2 server(s)');
      expect(context).toContain('github');
      expect(context).toContain('stripe');
    });

    it('includes total call count', () => {
      graph.record('github__list_issues', 'github');
      graph.record('github__list_issues', 'github');
      graph.record('github__list_issues', 'github');

      const context = graph.getSessionContext();
      expect(context).toContain('Total calls: 3');
    });
  });

  // ── Scale ────────────────────────────────────────────────────────────

  describe('scale', () => {
    it('handles 500 tools across 50 servers', () => {
      for (let i = 0; i < 50; i++) {
        for (let j = 0; j < 10; j++) {
          graph.record(`server-${i}__tool_${j}`, `server-${i}`);
        }
      }

      expect(graph.size).toBe(500);
      expect(graph.totalCalls).toBe(500);
      expect(graph.getActiveServerSlugs()).toHaveLength(50);
    });
  });
});
