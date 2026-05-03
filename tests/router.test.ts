import { describe, it, expect } from 'vitest';
import { parseToolName, namespaceTool } from '../src/engine/router.js';

describe('router', () => {
  // ── parseToolName ─────────────────────────────────────────────────────

  describe('parseToolName — valid inputs', () => {
    it('parses simple slug__tool', () => {
      expect(parseToolName('github__list_issues')).toEqual({
        slug: 'github',
        toolName: 'list_issues',
      });
    });

    it('parses slug with hyphens', () => {
      expect(parseToolName('google-bigquery__execute_sql')).toEqual({
        slug: 'google-bigquery',
        toolName: 'execute_sql',
      });
    });

    it('parses slug with numbers', () => {
      expect(parseToolName('s3__get_object')).toEqual({
        slug: 's3',
        toolName: 'get_object',
      });
    });

    it('parses complex real-world tool names', () => {
      expect(parseToolName('fred-full-access__get_series_observations')).toEqual({
        slug: 'fred-full-access',
        toolName: 'get_series_observations',
      });

      expect(parseToolName('bureau-of-labor-statistics-full-the-mega-server__get_cpi_data')).toEqual({
        slug: 'bureau-of-labor-statistics-full-the-mega-server',
        toolName: 'get_cpi_data',
      });

      expect(parseToolName('crowdstrike-falcon__detect_threats')).toEqual({
        slug: 'crowdstrike-falcon',
        toolName: 'detect_threats',
      });
    });
  });

  describe('parseToolName — first __ is the separator', () => {
    it('tool name containing __ preserves everything after first separator', () => {
      const result = parseToolName('stripe__list_balance__transactions');
      expect(result).toEqual({
        slug: 'stripe',
        toolName: 'list_balance__transactions',
      });
    });

    it('multiple __ separators — only first is used', () => {
      const result = parseToolName('a__b__c__d');
      expect(result).toEqual({ slug: 'a', toolName: 'b__c__d' });
    });
  });

  describe('parseToolName — invalid inputs', () => {
    it('returns null for names without __', () => {
      expect(parseToolName('catalog_search')).toBeNull();
      expect(parseToolName('simple_tool_name')).toBeNull();
    });

    it('returns null for single underscore', () => {
      expect(parseToolName('slug_tool')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseToolName('')).toBeNull();
    });

    it('returns null for just underscores (single)', () => {
      expect(parseToolName('_')).toBeNull();
    });
  });

  describe('parseToolName — boundary edge cases', () => {
    it('__ at the very start → empty slug', () => {
      expect(parseToolName('__tool_name')).toEqual({
        slug: '',
        toolName: 'tool_name',
      });
    });

    it('__ at the very end → empty tool name', () => {
      expect(parseToolName('slug__')).toEqual({
        slug: 'slug',
        toolName: '',
      });
    });

    it('just __ → both empty', () => {
      expect(parseToolName('__')).toEqual({
        slug: '',
        toolName: '',
      });
    });

    it('triple underscore → first __ splits, third char in toolName', () => {
      expect(parseToolName('___')).toEqual({
        slug: '',
        toolName: '_',
      });
    });

    it('quadruple underscore', () => {
      expect(parseToolName('____')).toEqual({
        slug: '',
        toolName: '__',
      });
    });
  });

  // ── namespaceTool ─────────────────────────────────────────────────────

  describe('namespaceTool', () => {
    it('creates standard namespace', () => {
      expect(namespaceTool('github', 'list_issues')).toBe('github__list_issues');
    });

    it('handles complex slugs', () => {
      expect(namespaceTool('fred-full-access', 'get_series_observations'))
        .toBe('fred-full-access__get_series_observations');
    });

    it('handles empty slug', () => {
      expect(namespaceTool('', 'tool')).toBe('__tool');
    });

    it('handles empty tool name', () => {
      expect(namespaceTool('slug', '')).toBe('slug__');
    });
  });

  // ── Roundtrip identity ────────────────────────────────────────────────

  describe('roundtrip: namespaceTool → parseToolName', () => {
    const testCases = [
      ['github', 'list_issues'],
      ['fred-full-access', 'get_series_observations'],
      ['cloudflare', 'manage_workers'],
      ['s3', 'put_object'],
      ['crowdstrike-falcon', 'detect_threats'],
      ['noaa-full-ultimate-weather-climate-intelligence', 'get_forecast'],
    ] as const;

    for (const [slug, toolName] of testCases) {
      it(`roundtrips ${slug}__${toolName}`, () => {
        const namespaced = namespaceTool(slug, toolName);
        const parsed = parseToolName(namespaced);
        expect(parsed).toEqual({ slug, toolName });
      });
    }
  });

  // ── Collision safety ──────────────────────────────────────────────────

  describe('namespace collision prevention', () => {
    it('different servers with same tool name produce unique namespaces', () => {
      const a = namespaceTool('github', 'list_repos');
      const b = namespaceTool('gitlab', 'list_repos');
      expect(a).not.toBe(b);
    });

    it('same server with different tool names produce unique namespaces', () => {
      const a = namespaceTool('stripe', 'list_charges');
      const b = namespaceTool('stripe', 'create_charge');
      expect(a).not.toBe(b);
    });

    it('slug "a_b" with tool "c" differs from slug "a" with tool "b__c"', () => {
      // This is key: a_b__c vs a__b__c
      // namespaceTool('a_b', 'c') = 'a_b__c'
      // namespaceTool('a', 'b__c') = 'a__b__c'
      const first = namespaceTool('a_b', 'c');
      const second = namespaceTool('a', 'b__c');
      expect(first).not.toBe(second);
    });
  });
});
