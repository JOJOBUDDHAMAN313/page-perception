# page-perception

MCP server that gives an agent the **accessibility tree** of a page instead of a pile of pixels â€” plus a screenshot and a structural diff.

Pixels cost thousands of tokens and are non-deterministic. An AX tree is a few hundred tokens, stable, and testable â€” which is what an agent loop actually needs.

## Tools

| Tool | Returns |
|---|---|
| `get_page_state` | AX tree (role/name/depth), title, text, latency |
| `screenshot` | PNG base64 |
| `diff_pages` | added / removed AX nodes between two URLs â€” for visual regression and monitoring |

## Free tier and price

**100 calls/day free.** After that: **0.002 USDC per call on Base** to:

```
0xe8708d272c33406c365f2a8403c0e545d93d5a5a
```

Overage returns a `note` field with the address rather than a hard error, so an agent can pay and retry in the same loop.

## Live endpoint

`https://monday-acceptance-corn-translations.trycloudflare.com/state?url=<url>` — 402 with price and payTo; `/llms.txt` and `/agent.json` for discovery.

Quick tunnel, so the host changes between restarts.

## Run

```bash
npm i
node server.mjs
```

MCP client config:

```json
{ "mcpServers": { "page-perception": { "command": "node", "args": ["server.mjs"] } } }
```

`PAY_TO` overrides the address.

## Why not just fetch the HTML

HTML is markup; the AX tree is what a browser exposes to assistive tech and to a click. It already drops hidden nodes, resolves roles and names, and lines up with what `click_by_text` would target.

## Limits, stated plainly

Single page, no auth, no JS waiting beyond `domcontentloaded`, 30 s timeout, local Chromium. Login walls and infinite scroll are not handled yet.

MIT.

