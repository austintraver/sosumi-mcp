# Sosumi MCP

Sosumi MCP is a local stdio server that retrieves public Apple Developer documentation and
renders it as Markdown for MCP clients. It is a maintained fork of
[NSHipster's sosumi.ai](https://github.com/NSHipster/sosumi.ai), which supplied the DocC,
Human Interface Guidelines, video-transcript, and Apple-search renderers.

This fork deliberately contains no hosted service, HTTP routes, CLI, website, agent-skill
hosting, A2A discovery, WebMCP, Cloudflare Worker configuration, or external-host policy
layer. It is for Austin's local Codex workflow.

## Tools

The server exposes four read-only tools:

- `searchAppleDocumentation` searches Apple Developer documentation.
- `fetchAppleDocumentation` renders an Apple reference page or a Human Interface Guidelines page.
  The HIG root path returns its table of contents.
- `fetchAppleVideoTranscript` renders a public Apple Developer video transcript.
- `fetchExternalDocumentation` renders a public Swift-DocC URL.

Apple's search page uses a JSONL transport: a `quickSearch` event supplies immediate matches,
then `search` events update the complete result set. The MCP preserves the complete result
ordering and appends any quick-search-only result. Run `pnpm run test:search:live` to check the
live Apple transport; normal tests use deterministic fixtures and never require the network.

## Run locally

Install dependencies, then start the stdio server:

```sh
pnpm install
pnpm start
```

For a Codex MCP configuration, use the packaged stdio entry point produced by the MCPB
bundle. During development, run `pnpm run dev` from this repository.

## Development

```sh
pnpm test
pnpm run check:ci
pnpm run pack:mcpb
pnpm run verify:mcpb
```

The stdio test initializes the server and lists its tools over JSON-RPC, proving that stdout
contains protocol messages only.

## Documentation use

See [using Sosumi MCP](docs/using-sosumi-mcp.md) for the client-facing documentation workflow
and citation guidance retained from the hosted service.

## License and attribution

The source remains available under the [MIT License](LICENSE.md). This fork retains useful
rendering code from [NSHipster's sosumi.ai](https://github.com/NSHipster/sosumi.ai); Apple owns
the documentation and media retrieved by the server.
