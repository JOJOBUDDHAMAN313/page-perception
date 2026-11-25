#!/usr/bin/env node
// x402 v2 paid page perception. Every GET that reads a page is charged and facilitator-verified.
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { chromium } from "playwright";
import fs from "node:fs";

const PAY_TO = process.env.PAY_TO || "0xe8708d272c33406c365f2a8403c0e545d93d5a5a";
const PRICE = process.env.PRICE || "$0.002";
const CHEAP = process.env.CHEAP || "$0.001";
const WATCH_PRICE = process.env.WATCH_PRICE || "$0.01";
const NETWORK = "eip155:8453";
const FACILITATOR = process.env.FACILITATOR || "https://facilitator.payai.network";
const PORT = Number(process.env.PORT || 8790);
const WATCH_FILE = "watch-state.json";
const watchState = fs.existsSync(WATCH_FILE) ? JSON.parse(fs.readFileSync(WATCH_FILE, "utf8")) : {};
const saveWatch = () => fs.writeFileSync(WATCH_FILE, JSON.stringify(watchState));

let browser;
async function visit(url) {
  browser ??= await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--no-sandbox"] })
    .catch(() => chromium.launch({ args: ["--no-sandbox"] }));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const status = resp ? resp.status() : 0;
    const headers = resp ? resp.headers() : {};

    const session = await ctx.newCDPSession(page);
    await session.send("Accessibility.enable");
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const ax = [];
    for (const n of nodes) {
      const role = n.role?.value, name = n.name?.value ?? "";
      if (!role || ["none", "generic", "InlineTextBox"].includes(role)) continue;
      if (!name && !["button", "link", "textbox", "checkbox", "heading"].includes(role)) continue;
      ax.push({ role, name: String(name).slice(0, 120) });
    }

    const dom = await page.evaluate(() => ({
      title: document.title,
      meta: [...document.querySelectorAll("meta[name],meta[property]")]
        .map((m) => ({ k: m.getAttribute("name") || m.getAttribute("property"), v: (m.getAttribute("content") || "").slice(0, 300) }))
        .slice(0, 40),
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      links: [...document.querySelectorAll("a[href]")]
        .map((a) => ({ text: (a.innerText || "").trim().slice(0, 80), href: a.href }))
        .filter((x) => x.text)
        .slice(0, 200),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 4000)).slice(0, 5),
      text: (document.body?.innerText || "").slice(0, 3000),
    }));

    return { url: page.url(), status, headers, latency_ms: Date.now() - t0, ax, ...dom };
  } finally {
    await ctx.close();
  }
}

const app = express();
app.use((req, res, next) => {
  res.on("finish", () => console.log(req.method, req.path, res.statusCode, req.headers["x-payment"] ? "PAY" : "nopay"));
  next();
});

const TOOLS = [
  ["get_page_state", "/state", PRICE, "Accessibility tree + text + latency"],
  ["get_text", "/text", CHEAP, "Visible text only"],
  ["get_title", "/title", CHEAP, "Title and HTTP status"],
  ["get_meta", "/meta", CHEAP, "og/meta tags and canonical"],
  ["get_links", "/links", CHEAP, "Absolute links with their text"],
  ["get_jsonld", "/jsonld", CHEAP, "JSON-LD blocks"],
  ["get_headers", "/headers", CHEAP, "HTTP status and response headers"],
  ["watch_page", "/watch", WATCH_PRICE, "Changed/unchanged verdict plus AX diff since the last check"],
];

app.get("/health", (_q, r) => r.type("text").send("ok"));
app.get("/", (_q, r) => r.type("text").send(
  `page-perception\n${TOOLS.map((t) => `GET ${t[1]}?url=<url>  ${t[2]}`).join("\n")}\nUSDC on ${NETWORK} to ${PAY_TO}\n`));
app.get("/llms.txt", (_q, r) => r.type("text").send(
  `# paid page reads. GET <path>?url=<url>, unpaid -> 402\n${TOOLS.map((t) => `# ${t[1]} ${t[2]} -> ${t[3]}`).join("\n")}\n# payTo ${PAY_TO} on ${NETWORK}, x402 exact\n`));
app.get("/agent.json", (_q, r) => r.json({
  name: "page-perception", version: "0.2.0",
  description: "Page reads for agents: accessibility tree, text, meta, links, JSON-LD, headers, and per-check diffs.",
  tools: TOOLS.map((t) => ({ name: t[0], method: "GET", url: t[1] + "?url=", price: t[2], returns: t[3] })),
  payment: { protocol: "x402", network: NETWORK, asset: "USDC", payTo: PAY_TO },
}));

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });
const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());

const routes = {};
for (const [, path, price, desc] of TOOLS) {
  routes[`GET ${path}`] = {
    accepts: [{ scheme: "exact", price, network: NETWORK, payTo: PAY_TO, maxTimeoutSeconds: 60 }],
    description: desc, mimeType: "application/json",
  };
}
app.use(paymentMiddleware(routes, server));

const needUrl = (req) => String(req.query.url || "");

app.get("/watch", async (req, res) => {
  const url = needUrl(req), token = String(req.query.token || "");
  if (!url || !token) return res.status(400).json({ error: "url and token required" });
  try {
    const p = await visit(url);
    const sig = p.ax.map((n) => n.role + ":" + n.name);
    const prev = watchState[token];
    watchState[token] = { sig, at: Date.now(), url };
    saveWatch();
    if (!prev || prev.url !== url) return res.json({ token, first_check: true, nodes: p.ax.length, latency_ms: p.latency_ms });
    const before = new Set(prev.sig), now = new Set(sig);
    const added = sig.filter((x) => !before.has(x)).slice(0, 100);
    const removed = prev.sig.filter((x) => !now.has(x)).slice(0, 100);
    res.json({ token, changed: added.length > 0 || removed.length > 0, added, removed, since_ms: Date.now() - prev.at, nodes: p.ax.length, latency_ms: p.latency_ms });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get("/state", async (req, res) => {
  const url = needUrl(req);
  if (!url) return res.status(400).json({ error: "url required" });
  try {
    const p = await visit(url);
    res.json({ url: p.url, title: p.title, latency_ms: p.latency_ms, nodes: p.ax.length, ax: p.ax.slice(0, 300), text: p.text });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

const shapes = {
  "/text": (p) => ({ url: p.url, title: p.title, status: p.status, chars: p.text.length, text: p.text, latency_ms: p.latency_ms }),
  "/title": (p) => ({ url: p.url, title: p.title, status: p.status, latency_ms: p.latency_ms }),
  "/meta": (p) => ({ url: p.url, status: p.status, title: p.title, canonical: p.canonical, meta: p.meta }),
  "/links": (p) => ({ url: p.url, status: p.status, count: p.links.length, links: p.links }),
  "/jsonld": (p) => ({ url: p.url, status: p.status, count: p.jsonld.length, blocks: p.jsonld }),
  "/headers": (p) => ({ url: p.url, status: p.status, headers: p.headers }),
};

for (const [path, shape] of Object.entries(shapes)) {
  app.get(path, async (req, res) => {
    const url = needUrl(req);
    if (!url) return res.status(400).json({ error: "url required" });
    try { res.json(shape(await visit(url))); } catch (e) { res.status(502).json({ error: e.message }); }
  });
}

app.listen(PORT, "127.0.0.1", () => console.log(`listening ${PORT} facilitator=${FACILITATOR} routes=${TOOLS.length}`));
