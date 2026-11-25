# page-perception

MCP server that gives an agent the **accessibility tree** of a page instead of a pile of pixels â€” plus a screenshot and a structural diff.

Pixels cost thousands of tokens and are non-deterministic. An AX tree is a few hundred tokens, stable, and testable â€” which is what an agent loop actually needs.

## Tools

| Tool | Returns |
|---|---|
| `get_page_state` | AX tree (role/name/depth), title, text, latency |
| `screenshot` | PNG base64 |
| `diff_pages` | added / removed AX nodes between two URLs â€” for visual regression and monitoring |

## Price

Every call is charged; there is no key and no free tier. USDC on Base to

```
0xe8708d272c33406c365f2a8403c0e545d93d5a5a
```

| Endpoint | Returns | Price |
|---|---|---|
| `GET /state?url=` | AX tree, text, latency | $0.002 |
| `GET /text?url=` | visible text only | $0.001 |
| `GET /title?url=` | title + HTTP status | $0.001 |
| `GET /meta?url=` | og/meta tags + canonical | $0.001 |
| `GET /links?url=` | absolute links with their text | $0.001 |
| `GET /jsonld?url=` | JSON-LD blocks | $0.001 |
| `GET /headers?url=` | HTTP status + response headers | $0.001 |
| `GET /watch?url=&token=` | changed/unchanged + the AX nodes added and removed since the last check | $0.01 |

Pages are read in a real browser, so client-rendered content is included. Unpaid calls return `402` with the
accepts block; `/llms.txt` and `/agent.json` describe the surface.

## Live endpoint

`https://provides-securities-cleaner-disable.trycloudflare.com/state?url=<url>`

Quick tunnel, so the host changes between restarts.

