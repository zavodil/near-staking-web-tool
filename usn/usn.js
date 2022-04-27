import "regenerator-runtime/runtime";
import * as nearAPI from "near-api-js";
import getConfig from "./config";

const nearConfig = getConfig("mainnet");
console.log(nearConfig)

document.getElementById("usn-account-id").addEventListener("keydown", checkUsnNearAccountKeyDown, false);
document.getElementById("usn-check-button").addEventListener("click", loadUSNBalances, false);
document.getElementById("usn-unwrap-button").addEventListener("click", usnUnwrap, false);
document.getElementById("usn-wrap-button").addEventListener("click", usnWrap, false);

async function connectUSNContract() {
    if (!window.usn_contract) {
        await connect(nearConfig);
        window.usn_contract = await new nearAPI.Contract(
            window.walletConnection.account(), "usn", {
                viewMethods: ['ft_balance_of'],
                changeMethods: ['claim'],
                sender: window.walletConnection.getAccountId()
            });
    }
}

async function loadNativeBalance (account_id) {
    try {
        window.near = await nearAPI.connect({
            deps: {
                keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore()
            },
            ...nearConfig
        });
        const account = await near.account(account_id);
        let balance = await account.getAccountBalance();
        if (balance) {
            return parseFloat(nearAPI.utils.format.formatNearAmount(balance?.available, 4));
        } else {
            return 0;
        }
    }
    catch (e){
        return 0;
    }
}

async function loadUSNBalances() {
    document.querySelector("#usn-check-loading").classList.remove('hidden');
    await connectUSNContract();

    let account_id = document.querySelector('#usn-account-id').value;

    window.localStorage.setItem('usn_account_id', account_id);

    if(account_id) {
        let balance = await loadNativeBalance(account_id);

        showUsnNearAmount(balance, account_id);

        window.usn_contract.ft_balance_of({account_id})
            .then(async amount => {
                console.log(amount);
                await showUSNAmount(amount, account_id);
            })
            .catch(err => {
                console.log(err)
                document.querySelector("#usn-check-loading").classList.add('hidden');
                document.querySelector('#check-usn-found').classList.add('hidden');
                document.querySelector('#check-usn-error').classList.remove('hidden');
            });
    }
}


async function GetSignUrl(account_id, method, params, deposit, gas, receiver_id, meta, callback_url, network) {
    if (!network)
        network = "mainnet";

    let actions = [];
    if(typeof receiver_id == 'string') {
        const deposit_value = typeof deposit == 'string' ? deposit : nearAPI.utils.format.parseNearAmount('' + deposit);
        actions = [nearAPI.transactions.functionCall(method, Buffer.from(JSON.stringify(params)), gas, deposit_value)];
    }
    else if (receiver_id.length === method.length
        && receiver_id.length === params.length
        && receiver_id.length === gas.length
        && receiver_id.length === deposit.length
    ){
        for(let i=0; i< receiver_id.length; i++){
            const deposit_value = typeof deposit[i] == 'string' ? deposit[i] : nearAPI.utils.format.parseNearAmount('' + deposit[i]);
            actions.push([nearAPI.transactions.functionCall(method[i], Buffer.from(JSON.stringify(params[i])), gas[i], deposit_value)]);
        }
    }
    else {
        alert("Illegal parameters");
        return
    }

    const keypair = nearAPI.utils.KeyPair.fromRandom('ed25519');
    const provider = new nearAPI.providers.JsonRpcProvider({url: 'https://rpc.' + network + '.near.org'});
    const block = await provider.block({finality: 'final'});

    let txs = [];
    if(typeof receiver_id == 'string') {
        txs = [nearAPI.transactions.createTransaction(account_id, keypair.publicKey, receiver_id, 1, actions, nearAPI.utils.serialize.base_decode(block.header.hash))];
    }
    else{
        for(let i=0; i< receiver_id.length; i++) {
            txs.push(nearAPI.transactions.createTransaction(account_id, keypair.publicKey, receiver_id[i], i, actions[i], nearAPI.utils.serialize.base_decode(block.header.hash)));
            console.log(txs)
        }
    }

    const newUrl = new URL('sign', 'https://wallet.' + network + '.near.org/');
    newUrl.searchParams.set('transactions', txs
        .map(transaction => nearAPI.utils.serialize.serialize(nearAPI.transactions.SCHEMA, transaction))
        .map(serialized => Buffer.from(serialized).toString('base64'))
        .join(','));
    newUrl.searchParams.set('callbackUrl', callback_url);
    if (meta)
        newUrl.searchParams.set('meta', meta);
    return newUrl.href;
}


function showUsnNearAmount(amount_near, account_id) {
    console.log(`NEAR balance ${amount_near.toFixed(4)}`)

    document.querySelector('#check-usn-error').classList.add('hidden');
    document.getElementById('usn-near-amount').value = amount_near.toFixed(4);
    if (parseFloat(amount_near.toFixed(4)) > 0) {
        document.querySelector('#usn-wrap-button').classList.remove('hidden');
        document.querySelector('#usn-wrap-button').setAttribute('account-id', account_id);
        document.querySelector('#check-usn-found').classList.remove('hidden');
    }
    else {
        document.querySelector('#usn-wrap-button').setAttribute('account-id', "");
        document.querySelector('#usn-wrap-button').classList.add('hidden');
        document.querySelector('#check-usn-error').classList.remove('hidden');
        document.querySelector('#check-usn-found').classList.add('hidden');
    }
}

async function showUSNAmount(amount, account_id){
    let amount_usn = (Math.round(amount / 10000000000) / 100000000);
    console.log(`USN balance ${amount_usn.toFixed(4)}`)

    document.getElementById('usn-amount').value = amount_usn.toFixed(4);
    if (parseFloat(amount_usn.toFixed(4)) > 0) {
        document.querySelector('#usn-unwrap-button').classList.remove('hidden');
        document.querySelector('#usn-unwrap-button').setAttribute('account-id', account_id);
    }
    else {
        document.querySelector('#usn-unwrap-button').classList.add('hidden');
        document.querySelector('#usn-unwrap-button').setAttribute('account-id', "");

    }

    document.querySelector("#usn-check-loading").classList.add('hidden');
}

async function usnWrap() {
    const account_id = document.querySelector('#usn-wrap-button').getAttribute('account-id')
    const amount = document.querySelector('#usn-near-amount').value;
    const amount_near = nearAPI.utils.format.parseNearAmount(amount);
    if(account_id) {
        let url = await GetSignUrl(
            account_id,
            "buy",
            {},
            amount_near,
            100000000000000,
            "usn",
            null,
            "",
            "mainnet");

        window.location.replace(url);
    }
}

async function usnUnwrap() {
    const account_id = document.querySelector('#usn-unwrap-button').getAttribute('account-id')
    const amount = document.querySelector('#usn-amount').value;
    const amount_usn = nearAPI.utils.format.parseNearAmount(amount).substring(0, 18);
    if(account_id) {
        let url = await GetSignUrl(
            account_id,
            "sell",
            {"amount": amount_usn},
            nearAPI.utils.format.parseNearAmount("0.000000000000000000000001"),
            100000000000000,
            "usn",
            null,
            "",
            "mainnet");

        window.location.replace(url);
    }
}

async function checkUsnNearAccountKeyDown(e) {
    e = e || window.event;
    if (e.keyCode == 13) {
        await loadUSNBalances();
    }
}



async function connect(nearConfig) {
    // Connects to NEAR and provides `near`, `walletAccount` and `contract` objects in `window` scope
    // Initializing connection to the NEAR node.
    window.near = await nearAPI.connect({
        deps: {
            keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore()
        },
        ...nearConfig
    });

    // Needed to access wallet login
    window.walletConnection = new nearAPI.WalletConnection(window.near);

    // Initializing our contract APIs by contract name and configuration.
    window.contract = await new nearAPI.Contract(window.walletConnection.account(), nearConfig.contractName, {
        // View methods are read-only – they don't modify the state, but usually return some value
        viewMethods: ['get_all_ideas'],
        // Change methods can modify the state, but you don't receive the returned value when called
        changeMethods: [],
        // Sender is the account ID to initialize transactions.
        // getAccountId() will return empty string if user is still unauthorized
        sender: window.walletConnection.getAccountId()
    });
}