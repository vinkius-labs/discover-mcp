/**
 * Capability Graph — Iterative Capability Extension.
 *
 * In-session state tracker that maintains a live graph of tool usage,
 * enabling context-aware capability discovery and cross-domain suggestions.
 *
 * The graph is ephemeral — it lives only for the duration of the MCP session.
 * No data is sent to any backend; this is pure client-side intelligence.
 */

/** A single node in the capability graph representing a used tool. */
export interface CapabilityNode {
  toolName: string;
  serverSlug: string;
  firstUsedAt: Date;
  lastUsedAt: Date;
  callCount: number;
}

/**
 * Tracks tool usage across the MCP session to provide context-aware
 * capability discovery. The graph enables the semantic router to
 * bias searches toward domains the agent is already working in.
 */
export class CapabilityGraph {
  private nodes = new Map<string, CapabilityNode>();

  /** Record a tool execution in the graph. */
  record(toolName: string, serverSlug: string): void {
    const existing = this.nodes.get(toolName);

    if (existing) {
      existing.lastUsedAt = new Date();
      existing.callCount++;
    } else {
      this.nodes.set(toolName, {
        toolName,
        serverSlug,
        firstUsedAt: new Date(),
        lastUsedAt: new Date(),
        callCount: 1,
      });
    }
  }

  /** Get all unique server slugs from tools used this session. */
  getActiveServerSlugs(): string[] {
    const slugs = new Set<string>();
    for (const node of this.nodes.values()) {
      slugs.add(node.serverSlug);
    }
    return [...slugs];
  }

  /** Get full usage history, sorted by most recently used. */
  getUsageHistory(): CapabilityNode[] {
    return [...this.nodes.values()]
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
  }

  /** Number of unique tools used this session. */
  get size(): number {
    return this.nodes.size;
  }

  /** Total number of tool calls across all tools this session. */
  get totalCalls(): number {
    let sum = 0;
    for (const node of this.nodes.values()) {
      sum += node.callCount;
    }
    return sum;
  }

  /**
   * Generate a concise session context string for search enrichment.
   * Returns empty string if no tools have been used yet.
   */
  getSessionContext(): string {
    if (this.nodes.size === 0) return '';

    const slugs = this.getActiveServerSlugs();
    return (
      `Active session: ${this.nodes.size} tool(s) used across ` +
      `${slugs.length} server(s) [${slugs.join(', ')}]. ` +
      `Total calls: ${this.totalCalls}.`
    );
  }
}
