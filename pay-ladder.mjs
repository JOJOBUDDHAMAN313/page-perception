import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(privateKeyToAccount(process.env.PAYER_PRIVATE_KEY)));
const f = wrapFetchWithPayment(fetch, client);
const base = process.argv[2];
for (const p of ["text","title","meta","links","jsonld","headers"]) {
  const r = await f(`${base}/${p}?url=${encodeURIComponent("https://example.com")}`, { method: "GET" });
  const j = await r.json();
  console.log(p, r.status, JSON.stringify(j).slice(0, 110));
}
