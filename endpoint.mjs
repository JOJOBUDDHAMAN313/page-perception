#!/usr/bin/env node
// x402 v2 paid page perception. GET /state is charged and facilitator-verified.
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { chromium } from "playwright";

const PAY_TO = process.env.PAY_TO || "0xe8708d272c33406c365f2a8403c0e545d93d5a5a";
const PRICE = process.env.PRICE || "$0.002";
const NETWORK = "eip155:8453";
const FACILITATOR = process.env.FACILITATOR || "https://facilitator.payai.network";
const PORT = Number(process.env.PORT || 8790);

let browser;
async function ax(url) {
  browser ??= await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--no-sandbox"] })
    .catch(() => chromium.launch({ args: ["--no-sandbox"] }));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const session = await ctx.newCDPSession(page);
    await session.send("Accessibility.enable");
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const out = [];
    for (const n of nodes) {
      const role = n.role?.value, name = n.name?.value ?? "";
      if (!role || ["none", "generic", "InlineTextBox"].includes(role)) continue;
      if (!name && !["button", "link", "textbox", "checkbox", "heading"].includes(role)) continue;
      out.push({ role, name: String(name).slice(0, 120) });
    }
    const text = (await page.innerText("body").catch(() => "")).slice(0, 3000);
    return { url: await page.url(), title: await page.title(), latency_ms: Date.now() - t0, nodes: out.length, ax: out.slice(0, 300), text };
  } finally { await ctx.close(); }
}

const app = express();
app.use((req, res, next) => {
  const paid = req.headers["x-payment"] ? "PAY" : "nopay";
  res.on("finish", () => console.log(req.method, req.path, res.statusCode, paid));
  next();
});

app.get("/health", (_q, r) => r.type("text").send("ok"));
app.get("/", (_q, r) => r.type("text").send(`page-perception\nGET /state?url=<url>\n${PRICE} USDC on ${NETWORK} to ${PAY_TO}\n`));
app.get("/llms.txt", (_q, r) => r.type("text").send(`# GET /state?url=<url> -> accessibility tree, text, latency\n# ${PRICE} USDC on ${NETWORK} to ${PAY_TO}; unpaid -> 402\n`));
app.get("/agent.json", (_q, r) => r.json({
  name: "page-perception", version: "0.1.0",
  description: "Accessibility tree for a URL. Cheaper than pixels and deterministic.",
  tools: [{ name: "get_page_state", method: "GET", url: "/state?url=", price: PRICE }],
  payment: { protocol: "x402", network: NETWORK, asset: "USDC", payTo: PAY_TO, pricePerCall: PRICE },
}));

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });
const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());

app.use(paymentMiddleware({
  "GET /state": {
    accepts: [{ scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO, maxTimeoutSeconds: 60 }],
    description: "Accessibility tree + text + latency for one URL",
    mimeType: "application/json",
  },
}, server));

app.get("/state", async (req, res) => {
  const url = String(req.query.url || "");
  if (!url) return res.status(400).json({ error: "url required" });
  try { res.json(await ax(url)); } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(PORT, "127.0.0.1", () => console.log(`listening ${PORT} facilitator=${FACILITATOR}`));
