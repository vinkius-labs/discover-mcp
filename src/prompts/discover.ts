/**
 * Discovery Prompt — Guided MCP server discovery via the Prompt Engine.
 *
 * Exposes a `/discover` slash-command in MCP clients (e.g., Claude Desktop)
 * that guides the agent through the capability discovery workflow.
 *
 * Uses PromptMessage.system() to inject routing instructions and
 * PromptMessage.user() to seed the first turn with the user's intent.
 */

import { f } from '../vurb.js';
import { PromptMessage } from '@vurb/core';

/**
 * The `/discover` prompt — available in the MCP client's prompt palette.
 *
 * When the user types `/discover fetch weather data`, the prompt seeds
 * the conversation with system instructions about the catalog workflow
 * and a user message containing the capability request.
 */
export const discoverPrompt = f.prompt('discover')
  .title('Discover MCP Servers')
  .describe('Find and activate MCP servers from the Vinkius marketplace based on what you need')
  .tags('discovery')
  .input({
    capability: { type: 'string' as const, description: 'What capability do you need? (e.g., "fetch weather data", "manage GitHub issues")' },
  })
  .handler(async (_ctx, args) => {
    const capability = (args as Record<string, string>).capability ?? 'explore available tools';

    return {
      messages: [
        PromptMessage.system(
          'You are using the Vinkius MCP Catalog — a gateway to 3,400+ MCP servers.\n\n' +
          'Follow this workflow to fulfill the user\'s request:\n\n' +
          '1. Use `catalog.request_capability` with the user\'s description to find matching servers\n' +
          '2. Review the ranked results and select the best match\n' +
          '3. Use `catalog.activate` with the server\'s listing ID to enable it\n' +
          '4. Use `catalog.tools` to see the newly available tools\n' +
          '5. Execute the appropriate tool via `catalog.execute`\n\n' +
          'Always explain your choices to the user. If the first result isn\'t ideal, try catalog.search with different keywords.',
        ),
        PromptMessage.user(
          `I need the following capability: ${capability}`,
        ),
      ],
    };
  });
