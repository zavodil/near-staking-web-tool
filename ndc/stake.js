import * as nearAPI from "near-api-js";
import fs from 'fs';

let blockId = 83240897; // <-- UPDATE VALUE HERE

const NearConfig = {
    networkId: "mainnet",
    nodeUrl: "https://rpc.mainnet.near.org",
    archivalNodeUrl: "https://rpc.mainnet.internal.near.org",
    contractName: "social.near",
    walletUrl: "https://wallet.near.org",
    wrapNearAccountId: "wrap.near",
    finalSynchronizationDelayMs: 3000,
};

const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
const _near = {};
_near.nearArchivalConnection = nearAPI.Connection.fromConfig({
    networkId: NearConfig.networkId, provider: {
        type: "JsonRpcProvider", args: {url: NearConfig.archivalNodeUrl},
    }, signer: {type: "InMemorySigner", keyStore},
});

const transformBlockId = (blockId) => blockId === "optimistic" || blockId === "final" ? {
    finality: blockId, blockId: undefined,
} : blockId !== undefined && blockId !== null ? {
    finality: undefined, blockId: parseInt(blockId),
} : {
    finality: "optimistic", blockId: undefined,
};

async function viewCall(provider, blockId, contractId, methodName, args, finality) {
    args = args || {};
    const result = await provider.query({
        request_type: "call_function",
        account_id: contractId,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        block_id: blockId,
        finality,
    });

    return (result.result && result.result.length > 0 && JSON.parse(Buffer.from(result.result).toString()));
}

_near.viewCall = (contractId, methodName, args, blockHeightOrFinality) => {
    const {blockId, finality} = transformBlockId(blockHeightOrFinality);
    return viewCall(_near.nearArchivalConnection.provider, blockId ?? undefined, contractId, methodName, args, finality);
};

fetch("https://near.zavodil.ru/pools_all.txt") // <-- List of all pools to check
    .then(res => res.json())
    .then(res => {
        console.log(`Loading ${res.data.length} nodes at block ${blockId}...`);
        let promises = res.data.map(node => _near.viewCall(node.account_id, "get_total_staked_balance", {}, blockId)
            .then(stake => ({account_id: node.account_id, stake}))
            .catch(() => ({account_id: node.account_id, stake: 0})))

        Promise.all(promises).then(values => {
            let output = {
                blockId, values
            }
            fs.writeFileSync(`stakes_${blockId}.json`, JSON.stringify(output));
            console.log(`File ${`stakes_${blockId}.json`} has been updated`);
        });
    });