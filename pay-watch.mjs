import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
const pk = process.env.PAYER_PRIVATE_KEY;
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(privateKeyToAccount(pk)));
const f = wrapFetchWithPayment(fetch, client);
const base = process.argv[2];
for (const n of [1,2]) {
  const r = await f(`${base}/watch?url=${encodeURIComponent("https://example.com")}&token=demo`, { method: "GET" });
  const pay = r.headers.get("x-payment-response") || r.headers.get("payment-response");
  console.log(n, "status", r.status, pay ? Buffer.from(pay, "base64").toString().slice(0, 90) : "no-pay", JSON.stringify(await r.json()).slice(0, 160));
}
