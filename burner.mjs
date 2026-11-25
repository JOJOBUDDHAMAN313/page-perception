import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const pk = generatePrivateKey();
const acct = privateKeyToAccount(pk);
fs.writeFileSync(".env", `PAYER_PRIVATE_KEY=${pk}\nPAY_TO=0xe8708d272c33406c365f2a8403c0e545d93d5a5a\n`);
console.log(acct.address);
