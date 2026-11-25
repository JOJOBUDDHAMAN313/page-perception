import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(privateKeyToAccount(process.env.PAYER_PRIVATE_KEY)));
const f = wrapFetchWithPayment(fetch, client);
const u = `${process.argv[2]}/watch?url=${encodeURIComponent("http://127.0.0.1:8812/flip2.html")}&token=flip2`;
for (const n of [1,2]) { const r = await f(u, { method: "GET" }); console.log(n, r.status, JSON.stringify(await r.json()).slice(0, 200)); await new Promise(r=>setTimeout(r,1500)); }
