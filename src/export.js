#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs';


const LoadDelegators = async (from_index, limit) => {
    return await fetch(`https://rest.nearapi.org/view`, {
        method: 'POST',
        body: JSON.stringify({
            "contract": "zavodil.poolv1.near",
            "method": "get_accounts",
            "params": {from_index, limit},
            "rpc_node": 'https://rpc.mainnet.near.org'
        }),
        headers: {'Content-type': 'application/json; charset=UTF-8'}
    })
        .then(res => res.json())
};

const FILENAME = "delegators.json";
(async () => {
    let all_delegators = [];
    let limit = 100;
    let iteration = 0;
    while (all_delegators.length === 0 || all_delegators.length % 100 === 0) {
        await LoadDelegators(iteration * limit, limit)
            .then(delegators => {
                all_delegators = all_delegators.concat(delegators);
                console.log(`${iteration}. Found ${delegators.length} delegators. Total: ${all_delegators.length}`);
            });
        iteration++;
    }

    all_delegators = all_delegators.filter(delegator => delegator.staked_balance !== "0");

    console.log(`Total delegators with stake: ${all_delegators.length}`);

    fs.writeFile(FILENAME, JSON.stringify(all_delegators), function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log(`File ${FILENAME} saved`);
        }
    });
})();




