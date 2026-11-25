import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const pk = process.env.PAYER_PRIVATE_KEY;
if (!pk) throw new Error("PAYER_PRIVATE_KEY missing");
const account = privateKeyToAccount(pk);

const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));
const f = wrapFetchWithPayment(fetch, client);

const baseUrl = process.argv[2];
const url = `${baseUrl}/state?url=${encodeURIComponent("https://example.com")}`;

const r = await f(url, { method: "GET" });
console.log("status", r.status);
const pay = r.headers.get("x-payment-response") || r.headers.get("payment-response");
if (pay) console.log("payment", pay);
const body = await r.json();
console.log("nodes", body.nodes, "title", body.title, "latency_ms", body.latency_ms);
