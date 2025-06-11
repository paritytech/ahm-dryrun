import { main, ChainConfig } from "./lib.js";
import fs from "fs";

let rc_chain_config: ChainConfig|undefined;
let ah_chain_config: ChainConfig|undefined;
if(process.argv[2]) {
    rc_chain_config = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
}

if(process.argv[3]) {
    ah_chain_config = JSON.parse(fs.readFileSync(process.argv[3], 'utf-8'));
}

main(rc_chain_config, ah_chain_config).catch((error) => {
    console.error(error);
    process.exit(1);
});