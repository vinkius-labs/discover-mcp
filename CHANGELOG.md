# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-02

### Added

- **Active Tool Request** — New `catalog_request_capability` meta-tool that accepts structured capability specifications (capability, domain, input/output hints) instead of free-text search
- **Hierarchical Semantic Routing** — Two-stage routing pipeline: category filtering → tool-level keyword ranking, all client-side
- **Iterative Capability Extension** — In-session `CapabilityGraph` that tracks tool usage across the session, enriching future capability requests with session context
- Capability graph records every tool execution (both proxy tools and `catalog_execute`) for cross-domain awareness
- New engine modules: `semantic-router.ts`, `capability-graph.ts`
- 48 new tests covering semantic router (tokenization, similarity, category matching, ranking, full pipeline) and capability graph (recording, tracking, session context, scale)

### Changed

- Meta-tools registration uses options object pattern for extensibility
- `refreshProxyTools` accepts optional `CapabilityGraph` for usage tracking
- Proxy tool handlers record executions in capability graph when provided

## [0.1.0] - 2026-04-11

### Added

- Initial release of `@vinkius-core/discover-mcp`
- 7 meta-tools: `catalog_search`, `catalog_browse`, `catalog_activate`, `catalog_deactivate`, `catalog_tools`, `catalog_analytics`, `catalog_execute`
- Dynamic proxy-tool loading from activated marketplace servers
- Namespaced tool routing (`{server_slug}__{tool_name}`)
- Intelligent search with synonym expansion and quality boosting
- Step-by-step onboarding messages when token is missing
- Support for Claude Desktop and Cursor configuration
