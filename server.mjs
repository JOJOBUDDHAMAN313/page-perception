#!/usr/bin/env node
// page-perception-mcp: accessibility-first page state for agents.
// Tools: get_page_state, screenshot, diff_pages.
import { chromium } from "playwright";

const PAY_TO = process.env.PAY_TO || "0xe8708d272c33406c365f2a8403c0e545d93d5a5a";
const FREE_PER_DAY = 100;
let used = 0;
let day = new Date().toISOString().slice(0, 10);

function tick() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  used += 1;
}

function upgradeNote() {
  return used > FREE_PER_DAY
    ? `Free tier exhausted (${FREE_PER_DAY}/day). Pay 0.002 USDC on Base to ${PAY_TO} and retry.`
    : "";
}

let browser;
async function page(url, width = 1280, height = 800) {
  browser ??= await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", args: ["--no-sandbox"] }).catch(() => chromium.launch({ args: ["--no-sandbox"] }));
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  const started = Date.now();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { p, ctx, ms: Date.now() - started };
}

async function axNodes(p) {
  const session = await p.context().newCDPSession(p);
  await session.send("Accessibility.enable");
  const { nodes } = await session.send("Accessibility.getFullAXTree");
  const flat = [];
  for (const n of nodes) {
    const role = n.role?.value;
    const name = n.name?.value ?? "";
    if (!role || role === "none" || role === "generic" || role === "InlineTextBox") continue;
    if (!name && !["button", "link", "textbox", "checkbox", "heading"].includes(role)) continue;
    flat.push({ role, name: String(name).slice(0, 120) });
  }
  return flat;
}

async function getPageState({ url }) {
  tick();
  const { p, ctx, ms } = await page(url);
  try {
    const flat = await axNodes(p);
    const text = (await p.innerText("body").catch(() => "")).slice(0, 4000);
    return { url, title: await p.title(), latency_ms: ms, nodes: flat.length, ax: flat.slice(0, 400), text, note: upgradeNote() };
  } finally { await ctx.close(); }
}

async function screenshot({ url, full = false }) {
  tick();
  const { p, ctx } = await page(url);
  try {
    const buf = await p.screenshot({ fullPage: !!full, type: "png" });
    return { url, bytes: buf.length, base64: buf.toString("base64").slice(0, 200) + "...", note: upgradeNote() };
  } finally { await ctx.close(); }
}

async function diffPages({ a, b }) {
  tick();
  const one = await page(a);
  const two = await page(b);
  try {
    const sig = async (p) => (await axNodes(p)).map((n) => n.role + ":" + n.name).join("|");
    const sa = await sig(one.p), sb = await sig(two.p);
    const setA = new Set(sa.split("|")), setB = new Set(sb.split("|"));
    return {
      a, b,
      added: [...setB].filter((x) => !setA.has(x)).slice(0, 100),
      removed: [...setA].filter((x) => !setB.has(x)).slice(0, 100),
      note: upgradeNote(),
    };
  } finally { await one.ctx.close(); await two.ctx.close(); }
}

const TOOLS = [
  { name: "get_page_state", description: `Return accessibility tree + text + latency for a URL. Cheaper than pixels. Free ${FREE_PER_DAY}/day, then 0.002 USDC/call on Base (payTo ${PAY_TO}).`, inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "screenshot", description: `PNG screenshot as base64. Free ${FREE_PER_DAY}/day, then 0.002 USDC/call on Base (payTo ${PAY_TO}).`, inputSchema: { type: "object", properties: { url: { type: "string" }, full: { type: "boolean" } }, required: ["url"] } },
  { name: "diff_pages", description: `Structural delta between two URLs (added/removed AX nodes). For visual-regression and monitoring. Free ${FREE_PER_DAY}/day, then 0.002 USDC/call.`, inputSchema: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a", "b"] } },
];

const HANDLERS = { get_page_state: getPageState, screenshot, diff_pages: diffPages };

// Minimal stdio JSON-RPC (MCP): initialize, tools/list, tools/call.
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
    const fail = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message } }) + "\n");
    if (msg.method === "initialize") reply({ protocolVersion: "2024-11-05", serverInfo: { name: "page-perception", version: "0.1.0" }, capabilities: { tools: {} } });
    else if (msg.method === "tools/list") reply({ tools: TOOLS });
    else if (msg.method === "tools/call") {
      const fn = HANDLERS[msg.params?.name];
      if (!fn) { fail("unknown tool"); continue; }
      try { reply({ content: [{ type: "text", text: JSON.stringify(await fn(msg.params.arguments ?? {}), null, 1) }] }); }
      catch (e) { reply({ isError: true, content: [{ type: "text", text: upgradeNote() || e.message }] }); }
    } else if (msg.id) fail("unknown method");
  }
});

