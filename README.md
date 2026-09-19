# Decision Anchor — MCP Server

External anchoring layer: records AI agent accountability boundaries on both sides. Content-blind.

This is the MCP (Model Context Protocol) surface of [Decision Anchor](https://decision-anchor.com). It is a thin adapter: every tool call goes to the public HTTP API at `api.decision-anchor.com` — the server holds no database, no payment keys, and no state of its own.

## Remote endpoint

The server runs hosted — you do not need to install anything to use it:

```
https://mcp.decision-anchor.com/mcp   (streamable HTTP)
```

Also listed on the official MCP Registry as `com.decision-anchor/da`.

### Keeping one identity across sessions

Every authenticated tool takes an `auth_token` argument. You can omit it if the connection itself carries the token — put your `auth_token` in the client's header configuration once and every session reuses the same agent. An explicit `auth_token` argument always takes precedence.

```json
{
  "mcpServers": {
    "decision-anchor": {
      "type": "http",
      "url": "https://mcp.decision-anchor.com/mcp",
      "headers": { "Authorization": "Bearer ${DA_AUTH_TOKEN}" }
    }
  }
}
```

The `headers` key is supported by Claude Code (`claude mcp add --transport http … --header "Authorization: Bearer …"`), Cursor, VS Code, Gemini CLI, and by `mcp-remote` for Claude Desktop (`--header "Authorization:${AUTH_HEADER}"` — no space after the colon on Windows). If a connection already carries a token and you call `register_agent`, the registration still happens and the response says that a second identity was created.

## Pricing

Registration is open (no prior authentication) and grants a free trial balance. After the trial, paid calls settle per-use in USDC via x402 on Base. Current prices come from the live API (`GET /v1/pricing/current`) — not from this repository.

## Tools

30 tools covering decision declarations (DD/EE), bilateral agreements, observation (ARA), sessions (SDAC/ISE), and account management. The authoritative list is what the server itself returns — query `tools/list` on the endpoint above.

## Documentation

- [llms.txt](https://api.decision-anchor.com/llms.txt) — orientation for agents
- [openapi.json](https://api.decision-anchor.com/openapi.json) — the HTTP API this adapter calls
- [AGENTS.md](https://github.com/zse4321/decision-anchor-sdk/blob/main/AGENTS.md) — full agent guide

## Running locally

```
npm ci
node index.js            # HTTP mode on PORT (default 3003)
```

`DA_API_URL` defaults to the production API; point it elsewhere for testing.

For a local stdio server (`node index.js` without `--http`) you can set `DA_AUTH_TOKEN` in `.env` and omit `auth_token` in tool calls. `DA_AUTH_TOKEN` is refused in `--http` mode — a shared HTTP server must not give every anonymous caller one identity.

## License

Apache-2.0
