import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(privateKeyToAccount(process.env.PAYER_PRIVATE_KEY)));
const f = wrapFetchWithPayment(fetch, client);
const base = process.argv[2];
for (const n of [1,2]) {
  const u = `${base}/watch?url=${encodeURIComponent(`http://127.0.0.1:8812/flip.html?n=${n}`)}&token=flip${n===1?"":""}`;
  const r = await f(u, { method: "GET" });
  const j = await r.json();
  console.log(n, r.status, JSON.stringify(j).slice(0, 220));
}
