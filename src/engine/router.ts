/**
 * Tool name router for the MCP Catalog.
 *
 * Handles the bidirectional mapping between:
 *   - Namespaced MCP tool names: `{listing_slug}__{tool_name}`
 *   - Upstream server slugs and their raw tool names
 */

/** Parse a namespaced tool name into its server slug and real tool name. */
export function parseToolName(namespacedName: string): { slug: string; toolName: string } | null {
  const separatorIndex = namespacedName.indexOf('__');

  if (separatorIndex === -1) {
    return null;
  }

  return {
    slug: namespacedName.substring(0, separatorIndex),
    toolName: namespacedName.substring(separatorIndex + 2),
  };
}

/** Create a namespaced tool name from a slug and tool name. */
export function namespaceTool(slug: string, toolName: string): string {
  return `${slug}__${toolName}`;
}
