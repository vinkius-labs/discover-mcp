# @vinkius-core/discover-mcp

**Stop configuring MCP servers one by one. Be smart — let your agent discover them.**

Every MCP server you add to your agent is another config block, another API key, another package version, another thing that breaks at 2 AM. At 5 servers it's annoying. At 15 it's a full-time job. At 50 it's impossible.

Discover replaces all of them with one line:

```json
{
  "mcpServers": {
    "vinkius": {
      "command": "npx",
      "args": ["-y", "@vinkius-core/discover-mcp"],
      "env": { "VINKIUS_CATALOG_TOKEN": "vk_catalog_YOUR_TOKEN" }
    }
  }
}
```

Your agent now has access to 3,400+ MCP servers on [Vinkius](https://vinkius.com). It finds what it needs, activates it, uses it, and moves on — without you lifting a finger.

---

## The problem nobody talks about

MCP is incredible. But every real-world setup looks like this:

```json
{
  "mcpServers": {
    "github":     { "command": "npx", "args": ["@modelcontextprotocol/server-github"],  "env": { "GITHUB_TOKEN": "..." } },
    "stripe":     { "command": "npx", "args": ["@stripe/mcp"],                          "env": { "STRIPE_KEY": "..." } },
    "slack":      { "command": "npx", "args": ["@anthropic/mcp-slack"],                  "env": { "SLACK_TOKEN": "..." } },
    "fred":       { "command": "npx", "args": ["@mcp/fred-server"],                      "env": { "FRED_API_KEY": "..." } },
    "salesforce": { "command": "npx", "args": ["@mcp/salesforce"],                       "env": { "SF_TOKEN": "...", "SF_INSTANCE": "..." } },
    "snowflake":  { "command": "npx", "args": ["@mcp/snowflake"],                        "env": { "SF_ACCOUNT": "...", "SF_USER": "...", "SF_PASS": "..." } },
    "jira":       { "command": "npx", "args": ["@mcp/jira-server"],                      "env": { "JIRA_TOKEN": "...", "JIRA_URL": "..." } },
    "datadog":    { "command": "npx", "args": ["@mcp/datadog"],                          "env": { "DD_API_KEY": "...", "DD_APP_KEY": "..." } },
    "notion":     { "command": "npx", "args": ["@mcp/notion"],                           "env": { "NOTION_TOKEN": "..." } },
    "hubspot":    { "command": "npx", "args": ["@mcp/hubspot"],                          "env": { "HS_TOKEN": "..." } }
  }
}
```

Ten servers. Ten npm packages. Fourteen environment variables. And this is just the beginning.

**Here's what actually happens as you scale:**

| Problem | Why it hurts |
|---------|-------------|
| 🧠 **Context window flooding** | Every server dumps its tools into your agent's prompt. 10 servers × 15 tools = 150 tool definitions competing for context. Accuracy drops. Costs spike. |
| 🔑 **Token sprawl** | Each server needs its own API key. Rotate one? Hope you remember which `.env`, which CI secret, which config file it lives in. |
| 💥 **Version rot** | `@stripe/mcp` just shipped v3. `@mcp/notion` needs Node 20. `@mcp/jira-server` is deprecated — the new one is `@atlassian/mcp-jira`. Good luck keeping 10+ packages in sync. |
| 🧊 **Frozen capabilities** | Your agent can only use what you pre-configured. Need weather data for a one-off question? Stop everything, find the package, get the API key, add the config, restart the agent. |
| 🔇 **Silent failures** | Server 7 of 10 crashes on startup. Your agent doesn't tell you — it just silently loses access to Notion. You find out three days later when a workflow breaks. |

The irony: **MCP was designed to give agents superpowers, but managing the servers takes the power away from you.**

---

## What if your agent managed its own tools?

That's Discover.

Instead of pre-loading every server your agent *might* need, you give it access to a catalog of 3,400+ servers on [Vinkius](https://vinkius.com). When your agent hits a problem, it searches the catalog, finds the right tool, activates it on the fly, and keeps working.

**You configure one server. Your agent discovers the rest.**

```json
{
  "mcpServers": {
    "vinkius": {
      "command": "npx",
      "args": ["-y", "@vinkius-core/discover-mcp"],
      "env": { "VINKIUS_CATALOG_TOKEN": "vk_catalog_YOUR_TOKEN" }
    }
  }
}
```

> 10 servers → 1. Fourteen tokens → 1. Zero maintenance.

---

## See it in action

You ask your agent: *"How has U.S. inflation affected our revenue this year?"*

Your agent has never seen economic data before. But it doesn't need you to install anything:

1. **Recognizes the gap** — "I need macroeconomic data, but I don't have a tool for that"
2. **Searches the catalog** — finds **FRED**, a database with 816,000+ economic time series on [Vinkius](https://vinkius.com)
3. **Activates it** — FRED tools appear instantly, on demand
4. **Pulls CPI data** — last 24 months of U.S. Consumer Price Index
5. **Connects to Stripe** — correlates inflation trends with your actual revenue
6. **Posts to Slack** — sends the analysis to your #finance channel

You configured none of that. You didn't know FRED existed. You didn't write a Stripe integration. **Your agent discovered what it needed and used it** — across three completely different domains, in a single conversation.

Tomorrow it might need weather data, or satellite imagery, or OSHA compliance records. You'll never have to configure those either.

---

## 3,400+ servers on [Vinkius](https://vinkius.com)

| Category | What your agent can access |
|----------|---|
| **Industry Titans** | Salesforce · SAP S/4HANA · Dynamics 365 · Oracle NetSuite · Okta · HubSpot CRM |
| **Money Moves** | Stripe · PayPal · Plaid · Brex · Mercury · QuickBooks · Shopify · DocuSign |
| **Ship It** | GitHub · GitLab · Jira · Cloudflare (25 tools!) · CircleCI · Bitbucket · Linear |
| **AI Frontier** | OpenAI · Anthropic · NVIDIA · Databricks · Cohere · Azure AI · Amazon Bedrock |
| **The Unthinkable** | FRED (816K+ economic series) · NOAA (36 tools) · Eurostat · U.S. Census · ECB · BLS · EIA |
| **Fort Knox** | CrowdStrike Falcon · Snyk · CyberArk · Checkmarx · Auth0 · Black Duck |
| **Growth Engine** | Google Ads · Meta Ads · Facebook Ads · Mailchimp · Amplitude · Ahrefs · ActiveCampaign |
| **Talk to Me** | Slack · WhatsApp · Twilio · Zoom · Discord · Intercom · Zendesk |
| **Brain Trust** | Snowflake · BigQuery · Notion · Confluence · Databricks · Elasticsearch |
| **Superpower** | Midjourney · Wolfram Alpha · ArcGIS · E2B · Home Assistant · Alexa |
| **Friends of MCP** | Firecrawl · LangSmith · LangGraph · LlamaIndex · Mem0 · Zapier · Make |

Every server is production-grade and governed: DLP, FinOps, and SSRF protection on every call.

> Browse the full catalog at [vinkius.com](https://vinkius.com)

---

## How it works

Instead of flooding your agent's context with thousands of tool definitions (which kills accuracy and burns tokens), Discover uses **just-in-time activation**: your agent loads only what it needs, when it needs it.

1. **Agent recognizes a gap** — "I need economic data but I don't have a tool for that"
2. **Agent searches the catalog** — finds the right server among 3,400+ on [vinkius.com](https://vinkius.com)
3. **Agent activates it** — tools appear instantly, zero config
4. **Agent uses the tools** — as if they were always there
5. **Agent moves on** — next task, next domain, same conversation

This works across any combination of domains in a single session. Economics → payments → communications → analytics — your agent handles it seamlessly.

**No restarts. No config changes. No context wasted on tools you're not using.**

---

## Quick start

1. Create a free account at [cloud.vinkius.com](https://cloud.vinkius.com)
2. Go to **Settings → Catalog Tokens** → Create a token
3. Add to your config:

#### Claude Desktop / Cursor / Windsurf

```json
{
  "mcpServers": {
    "vinkius": {
      "command": "npx",
      "args": ["-y", "@vinkius-core/discover-mcp"],
      "env": {
        "VINKIUS_CATALOG_TOKEN": "vk_catalog_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

That's it. Your agent now has access to everything on [Vinkius](https://vinkius.com).

---

## Built-in tools

| Tool | What it does |
|------|---|
| `catalog_request_capability` | Describe what you need — the engine finds and ranks the best servers automatically |
| `catalog_search` | Search by intent — "process refunds", "monitor Kubernetes", "analyze sentiment" |
| `catalog_browse` | Explore all available categories |
| `catalog_activate` | Activate a server (free = instant, paid = checkout link) |
| `catalog_deactivate` | Deactivate a server and remove its tools |
| `catalog_tools` | List all tools currently available |
| `catalog_analytics` | Usage stats for your active servers |
| `catalog_execute` | Run any tool from any active server |
| `catalog_inspect` | View full parameters and schema for any tool before calling it |

---

## Built with [Vurb.ts](https://vurb.vinkius.com)

Discover is powered by [Vurb.ts](https://github.com/vinkius-labs/vurb.ts) — the MVA (Model-View-Agent) framework for the Model Context Protocol. Every tool in this project uses the full Vurb architecture:

```typescript
// This is actual code from this project — not a demo.

const search = catalog.query('search')
  .describe('Search the Vinkius MCP marketplace to find servers by keyword.')
  .instructions(
    'Use this when the user asks about specific tools or integrations. ' +
    'For structured capability requests, prefer catalog.request_capability.',
  )
  .withString('query', 'What you need (e.g., "track cloud spending")')
  .withOptionalNumber('limit', 'Max results to return (default: 10)')
  .cached()
  .tags('discovery')
  .bindState(['idle', 'exploring', 'activated'], 'SEARCH')
  .egress(16_000)
  .returns(SearchPresenter)
  .handle(async (input, ctx) => {
    const result = await ctx.client.search(input.query, input.limit ?? 10);
    return result.servers;
  });
```

**Vurb primitives in use:**

| Primitive | What it does here |
|-----------|---|
| `f.router()` | Groups all 9 tools under `catalog.*` — zero prefix repetition |
| `.returns(Presenter)` | MVA View layer — formats responses with tables, suggestions, and system rules |
| `.instructions()` | AI-first prompt engineering baked into every tool definition |
| `.cached()` / `.stale()` | Epistemic cache hints — tells the LLM when data might be outdated |
| `.bindState()` | FSM temporal gating — prevents the agent from calling `execute` before `activate` |
| `.invalidates()` | Cache invalidation — `activate` automatically invalidates `tools` and `analytics` |
| `.concurrency()` | Intent Mutex — prevents the LLM from double-firing `execute` calls |
| `.egress()` | Payload size guards — protects the agent's context budget |
| `f.fsm()` | Finite state machine tracking the discovery lifecycle |
| `f.error()` | Structured self-healing errors with recovery suggestions |
| `f.prompt()` | Prompt Engine — exposes `/discover` as a slash-command in MCP clients |
| `definePresenter()` | Response formatting with HATEOAS suggestions and agent limits |
| `defineModel()` | Domain schemas with Zod validation |

> Build your own MCP server with Vurb - Open Source Framework - at [vurb.vinkius.com](https://github.com/vinkius-labs/vurb.ts)

---

## Security

Every call flows through the [Vinkius AI Gateway](https://vinkius.com):

- 🔐 One token, per-server credentials resolved transparently
- 🛡️ PII redaction on every response
- 💰 Token budget protection
- 🔒 DNS-pinned upstream fetches — your agent never connects to APIs directly

## Environment variables

| Variable | Required | Default |
|----------|----------|---------|
| `VINKIUS_CATALOG_TOKEN` | ✅ | — |

## Development

```bash
npm install
VINKIUS_CATALOG_TOKEN=vk_catalog_... 
npm run dev
npm test        # 202+ tests
npm run build
```

## License

Apache 2.0 — see [LICENSE](./LICENSE)

---

<p align="center">
  <strong>Stop configuring servers one by one. Let your agent figure it out.</strong><br/>
  Built by <a href="https://vinkius.com">Vinkius</a>
</p>
