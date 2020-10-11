import "regenerator-runtime/runtime";
import * as nearAPI from "near-api-js";
import getConfig from "./config";
import {sha256} from 'js-sha256';

const NearCoef = 1000000000000000000000000;
const nearConfig = getConfig("mainnet");

$(document).on('input', '#near-amount', function () {
    updateNearAmountHint();
});

$(document).on('mouseenter', 'td.col-status', function (e) {
    const on = e.target.innerHTML.includes("green");
    $(this).tooltip({placement: 'bottom', title: "Mainnet status: " + (on ? 'ACTIVE' : 'DISABLED')});
}).on('mouseenter', 'td.col-stake', function (e) {
    let percent = $(e.target).attr("data-percent");
    if(percent)
        $(this).tooltip({placement: 'bottom', title: percent + "% of total stake"});
}).on('mouseenter', 'td.col-phase-2-vote', function (e) {
    const on = e.target.innerHTML.includes("green");
    $(this).tooltip({
        placement: 'bottom',
        title: on ? 'VOTED to unlock token transfers' : "Doesn't support token transfers unlock"
    });
}).on('mouseenter', '.col-number-of-accounts', function (e) {
    $(this).tooltip({
        placement: 'bottom',
        title: "Number of delegators"
    });
}).on('mouseenter', '.th-phase-2-vote', function (e) {
    $(this).tooltip({
        placement: 'bottom',
        title: "Phase 2 vote"
    });
}).on('mouseenter', 'th.col-status', function (e) {
    $(this).tooltip({
        placement: 'bottom',
        title: "Mainnet status"
    });
});






document.querySelector('#sign-in').addEventListener('click', () => {
    if (window.lockupAccountId)
        walletConnection.requestSignIn(window.lockupAccountId, 'Near Staking');
});


function updateNearAmountHint() {
    document.querySelector('#create-delegation-amount').innerHTML = nearAPI.utils.format.parseNearAmount(document.querySelector('#near-amount').value);
}

document.querySelector('#select-pool').addEventListener('click', () => {
    if (window.table.rows({selected: true}).data()[0]) {
        window.poolId = window.table.rows({selected: true}).data()[0].account_id;
        console.log(window.poolId);
        if (window.poolId) {
            walletConnection.requestSignIn(window.lockupAccountId, 'NEAR Staking');

            connectToContract(window.accountId, window.lockupAccountId, [], ['select_staking_pool']).then(() => {
                let t = window.contract.select_staking_pool({"staking_pool_account_id": window.poolId}).then((result) => {
                    document.querySelector('#select-staking-pool-block').classList.add('hidden');
                    document.querySelector('#create-delegation-block').classList.remove('hidden');
                });
            });
        }
    }
});

document.querySelector('#create-delegation').addEventListener('click', () => {
    const amount = Number(document.querySelector('#near-amount').value);
    if (window.poolId && window.lockupAccountId && window.accountId && amount) {
        document.querySelector('#create-delegation').setAttribute("disabled", "");
        document.querySelector('#create-delegation-hint').classList.remove('hidden');
        const amountNear = nearAPI.utils.format.parseNearAmount(document.querySelector('#near-amount').value);
        walletConnection.requestSignIn(window.lockupAccountId, 'NEAR Staking');
        connectToContract(window.accountId, window.lockupAccountId, [], ['deposit_and_stake']).then(() => {
            let log = window.contract.deposit_and_stake({"amount": amountNear}).then((result) => {

                if (result) {
                    document.querySelector('#create-delegation-result-success').classList.remove('hidden');
                    document.querySelector('#create-delegation-result-failed').classList.add('hidden');
                } else {
                    document.querySelector('#create-delegation-result-failed').classList.remove('hidden');
                    document.querySelector('#create-delegation-result-success').classList.add('hidden');
                }

                document.querySelector('#create-delegation').removeAttribute("disabled", "");
                document.querySelector('#create-delegation-hint').classList.add('hidden');
                document.querySelector('#create-delegation-result-block').classList.remove('hidden');
            });
        });
    }
});

document.querySelector('#load-account').addEventListener('click', () => {
    window.accountId = prepareAccountId(document.querySelector('#near-account').value);
    window.lockupAccountId = accountToLockup('lockup.near', window.accountId);

    const isLoggedIn = walletConnection.getAccountId() === window.accountId;

    connectToContract(window.accountId, window.lockupAccountId, ['get_owner_account_id', 'get_balance', 'get_staking_pool_account_id', 'get_known_deposited_balance'], []).then(() => {

        let t0 = window.contract.get_owner_account_id({}).then((ownerId) => {
            if (ownerId !== window.accountId) {
                document.querySelector('#lockup-account-not-found').classList.remove('hidden');
                return;
            } else {
                document.querySelector('#lockup-account-not-found').classList.add('hidden');
            }

            let t1 = window.contract.get_balance({}).then((lockupAmount) => {
                let t2 = window.contract.get_known_deposited_balance({}).then((lockupDepositedAmount) => {
                    const remainingAmount = Math.max(0, (Number(lockupAmount) / NearCoef) - (Number(lockupDepositedAmount) / NearCoef) - 36);
                    const totalAmountFormatted = nearAPI.utils.format.formatNearAmount(lockupAmount.toString(), 2);
                    const depositedAmountFormatted = nearAPI.utils.format.formatNearAmount(lockupDepositedAmount.toString(), 2);
                    document.querySelector('#near-amount').value = remainingAmount;
                    document.querySelector('#near-total-amount').innerHTML = totalAmountFormatted;
                    document.querySelector('#near-deposited-amount').innerHTML = depositedAmountFormatted;
                    document.querySelector('#lockup-name').innerHTML = `<a href="https://explorer.mainnet.near.org/accounts/${window.lockupAccountId}" target="_blank">${window.lockupAccountId}</a>`;
                    document.querySelector('#lockup-amount-block').classList.remove('hidden');

                    window.contract.get_staking_pool_account_id({}).then((poolId) => {
                        if (poolId) {
                            window.poolId = poolId;
                            console.log(window.poolId);
                            document.querySelector('#existing-staking-pool-block').classList.remove('hidden');
                            document.querySelector('#existing-staking-pool').innerHTML = window.poolId;

                            document.querySelector('#create-delegation-block').classList.remove('hidden');
                            updateNearAmountHint();
                            document.querySelector('#create-delegation-pool').innerHTML = window.poolId;
                            document.querySelector('#create-delegation-account-id').innerHTML = window.accountId;

                            if (isLoggedIn) {
                                document.querySelector('#create-delegation').classList.remove('hidden');
                            } else {
                                document.querySelector('#sign-in-block').classList.remove('hidden');
                                document.querySelector('#sign-out-block').classList.add('hidden');
                            }

                        } else {
                            document.querySelector('#select-staking-pool-block').classList.remove('hidden');

                            window.table = $('#pools-table').DataTable({
                                destroy: true,
                                columnDefs: [{
                                    orderable: false,
                                    className: 'select-checkbox',
                                    targets: 0
                                },
                                    {
                                        targets: 2, render: function (data) {
                                            return data + " %";
                                        }
                                    },
                                ],
                                select: {
                                    style: 'os',
                                    selector: 'td:first-child'
                                },
                                order: [[6, 'desc']],
                                columns: [
                                    {data: null, defaultContent: ''},
                                    {data: "account_id"},
                                    {data: "numerator"},
                                    {data: "number_of_accounts"},
                                    {data: "vote"},
                                    {data: "stake"},
                                    {data: "stake", visible: false}
                                ],
                                ajax: "pools.txt",
                                createdRow: function (row, data, dataIndex) {
                                    const $dateCell = $(row).find('td:eq(5)');
                                    const item = $dateCell.text();
                                    $dateCell
                                        .data('order', item)
                                        .html(Number(item).toLocaleString() + "&nbsp;Ⓝ");

                                    const $voteCell = $(row).find('td:eq(4)');
                                    const vote = $voteCell.text();
                                    $voteCell
                                        .data('order', Number(data.vote))
                                        .html(Number(vote) ? `<i class="fa fa-check green" aria-hidden="true"></i>` : `<i class="fa fa-times red" aria-hidden="true"></i>`)

                                }
                            });

                            if (isLoggedIn) {
                                document.querySelector('#select-pool').classList.remove('hidden');
                            } else {
                                document.querySelector('#sign-in-block').classList.remove('hidden');
                                document.querySelector('#sign-out-block').classList.add('hidden');
                            }
                        }
                    });

                });
            });
        }).catch(e => {
            document.querySelector('#lockup-account-not-found').classList.remove('hidden');
            document.querySelector('#lockup-amount-block').classList.add('hidden');
            document.querySelector('#existing-staking-pool-block').classList.add('hidden');
            document.querySelector('#create-delegation-block').classList.add('hidden');
        });
    });


    //getBalance(account, lockup, ['get_balance'], []);
    //near view 9a881619b2bd37617af1255448659c5f512bc0c4.lockup.near get_balance ''
    /*start("vadim.near", "9a881619b2bd37617af1255448659c5f512bc0c4.lockup.near").then(() => {
        window.contract1.select_staking_pool({"staking_pool_account_id": "zavodil.poolv1.near"});
    });*/
});

const queryString = window.location.search;
if (queryString.startsWith("?address=")) {
    const address = queryString.substr("?address=".length);
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.main').classList.remove('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.add('active');

    document.querySelector('#near-account').value = address;
    setTimeout(() => {
        $("#load-account").trigger("click")
    }, 0);
} else if (queryString.includes("pools")) {
    document.querySelector('.container.pools').classList.remove('hidden');
    document.querySelector('.container.main').classList.add('hidden');
    document.querySelector('#nav-pools').classList.add('active');
    document.querySelector('#nav-main').classList.remove('active');

    window.pools_table = $('#view-pools-table').DataTable({
        destroy: true,
        pageLength: 100,
        rowId: "account_id",
        sortable: true,
        columnDefs: [
            { "sorting": [ "desc", "asc" ], "targets": [ 5,6,7,8,9,10 ] },
            { "sorting": [ "asc", "desc" ], "targets": [ 1,4 ] },
            {
                targets: 0, render: function (data) {
                    return `<a data-toggle="modal" data-target="#poolModal" data-pool-id="${data}" href="#">${data}</a>`;
                },
            },
            {
                targets: 4, render: function (data) {
                    return data + " %";
                },
            },
            {
                targets: 6, render: function (data) {
                    return Number(data) ? `<i class="fa fa-check green" aria-hidden="true"></i>` : `<i class="fa fa-times red" aria-hidden="true"></i>`;
                },
            },
            {
                targets: 7, render: function (data) {
                    return `<div class="col-bar">
                                <div class="cum-stake-number">${Number(data).toLocaleString()} &nbsp;Ⓝ</div>
                                <div class="cum-bar-wrapper">
                                    <div class="bar-1"></div>
                                    <div class="bar-2"></div>
                                </div>                                
                            </div>`;
                },
            },
            {
                targets: 8, render: function (data) {
                    return Number(data) ? `<i class="fas fa-toggle-on green"></i>` : `<i class="fas fa-toggle-off red"></i>`;
                },
            },
            {"orderable": false, "targets": [1, 2, 3]},
            {"orderData": 10, "targets": 7},
            {"orderData": 9, "targets": 6},
            {"orderData": 11, "targets": 8},
        ],
        select: {
            style: 'os',
            selector: 'td:first-child'
        },
        order: [[7, 'desc']],
        columns: [
            {data: "account_id", class: "col-pool-name"},
            {data: "info", defaultContent: ""},
            {data: "url", defaultContent: ""},
            {data: "country_code", defaultContent: ""},
            {data: "numerator", class: "col-fees"},
            {data: "number_of_accounts", class: "col-number-of-accounts"},
            {data: "vote", class: "col-phase-2-vote"},
            {data: "stake", class: "col-stake"},
            {data: "status", class: "col-status"},
            {data: "vote_value", visible: false, defaultContent: ""},
            {data: "stake_value", visible: false, defaultContent: ""},
            {data: "status_value", visible: false, defaultContent: ""},
            {data: "stake_percent", visible: false, defaultContent: ""},

        ],
        ajax: {
            url: "pools_all.txt",
            dataSrc: function (json) {
                if (json.seat_price) {
                    document.querySelector('#seat-price').classList.remove('hidden');
                    document.querySelector('#seat-price-value').innerText = Number(json.seat_price).toLocaleString();
                }

                let total = 0;
                for (let i = 0; i < json.data.length; i++) {
                    if (json.data[i].status)
                        total += Number(json.data[i]["stake"])
                }
                for (let i = 0; i < json.data.length; i++) {
                    json.data[i]["stake_value"] = Number(json.data[i]["stake"]);
                    json.data[i]["vote_value"] = Number(json.data[i]["vote"]);
                    json.data[i]["status_value"] = Number(json.data[i]["status"]);
                    json.data[i]["stake_percent"] = (Number(json.data[i]["stake"]) / total * 100).toFixed(2);
                }

                document.querySelector('#pools-total-num').classList.remove('hidden');
                document.querySelector('#pools-total-num-value').innerText = json.data.length;

                return json.data;
            },
        },
        rowCallback: function (row, data, displayNum, displayIndex, dataIndex) {
            $(row).toggleClass("row-kickout", !data.status);

            if (data.stake_percent) {
                let staked_by_others = 0;
                const all_nodes = window.pools_table.rows( { order: 'applied' } ).nodes();

                for(let i = 0; i< displayIndex; i++)
                    staked_by_others += Number($(all_nodes[i]).find(".col-stake").attr("data-percent"));

                $(row).find(".col-stake").attr("data-percent", data.stake_percent);
                $(row).find(".col-stake .bar-1").css("background", "rgb(253, 204, 186)").css("opacity", "0.2").css("width", staked_by_others + "%").css("min-width", "1px");
                $(row).find(".col-stake .bar-2").css("background", "rgb(213, 111, 74)").css("opacity", "0.2").css("width", data.stake_percent + "%").css("min-width", "1px");
            }
        },
        fnInitComplete: function () {
            connectToPoolDetailsContract().then(() => {
                window.pool_details.get_all_fields({"from_index": 0, "limit": 100}).then((data) => {
                    window.pools = [];
                    for (let pool in data) {
                        const row = window.pools_table.row(`[id="${pool}"]`);
                        if (row.length) {
                            const rowData = row.data();
                            if (data[pool].country_code)
                                rowData.country_code = `<ul class="f16"><li class="flag ${data[pool].country_code.toLowerCase()}"></li></ul>`;
                            if (data[pool].url) {
                                if (!/^https?:\/\//i.test(data[pool].url))
                                    data[pool].url = 'http://' + data[pool].url;
                                rowData.url = `<a href="${data[pool].url}" target="_blank"><i class="fas fa-link"></i></a>`;
                            }
                            if (pool && (data[pool].twitter || data[pool].url || data[pool].email || data[pool].description || data[pool].country || data[pool].city))
                                rowData.info = `<a data-toggle="modal" data-target="#poolModal" data-pool-id="${pool}" href="#"><i class="fas fa-info-circle"></i></a>`;
                            row.data(rowData).draw();
                        }
                        window.pools[pool] = data[pool];
                    }
                });
            });
        },
        footerCallback: function (row, data, start, end, display) {
            const total = this.api()
                .column(10)
                .data()
                .reduce(function (a, b) {
                    return parseInt(a) + parseInt(b);
                }, 0);

            const delegators = this.api()
                .column(5)
                .data()
                .reduce(function (a, b) {
                    return parseInt(a) + parseInt(b);
                }, 0);

            $(this.api().column(7).footer()).html(
                total.toLocaleString() + '&nbsp;Ⓝ'
            );

            $(this.api().column(5).footer()).html(
                delegators.toLocaleString()
            );
        }
    });


} else {
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.main').classList.remove('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.add('active');
}

async function connectToPoolDetailsContract() {
    window.near = await nearAPI.connect({
        deps: {
            keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore()
        },
        ...nearConfig
    });

    window.walletConnection = new nearAPI.WalletConnection(window.near);

    window.pool_details = await new nearAPI.Contract(window.walletConnection.account(), "name.near", {
        viewMethods: ['get_all_fields', 'get_num_pools'],
        changeMethods: [],
        sender: window.walletConnection.getAccountId()
    });
}

$('#poolModal').on('show.bs.modal', function (event) {
    const control = $(event.relatedTarget);
    const pool = control.data('pool-id');
    const modal = $(this);
    const poolFound = window.pools.hasOwnProperty(pool);
    if (poolFound) {
        const poolProfile = window.pools[pool];
        modal.find('#pool-twitter').toggleClass('hidden', !poolProfile.twitter);
        modal.find('#pool-twitter-value').html(`<a href="https://twitter.com/${poolProfile.twitter}">${poolProfile.twitter}</a>`);

        modal.find('#pool-url').toggleClass('hidden', !poolProfile.url);
        modal.find('#pool-url-value').html(`<a href="${poolProfile.url}" target="_blank">${poolProfile.url}</a>`);

        modal.find('#pool-email').toggleClass('hidden', !poolProfile.email);
        modal.find('#pool-email-value').html(`<a href="mailto:${poolProfile.email}">${poolProfile.email}</a>`);

        modal.find('#pool-discord').toggleClass('hidden', !poolProfile.discord);
        modal.find('#pool-discord-value').html(`<a href="${poolProfile.discord}" target="_blank">Link</a>`);

        modal.find('#pool-country').toggleClass('hidden', !poolProfile.country);
        modal.find('#pool-country-value').text(poolProfile.country);

        modal.find('#pool-city').toggleClass('hidden', !poolProfile.city);
        modal.find('#pool-city-value').text(poolProfile.city);

        modal.find('#pool-description').toggleClass('hidden', !poolProfile.description);
        modal.find('#pool-description-value').text(poolProfile.description);
        console.log(poolProfile.description);
        console.log(poolProfile);
    }


    modal.find('#block-explorer').html(`<a href="https://explorer.near.org/accounts/${pool}" target="_blank">${pool}</a>`);
    modal.find('.modal-title').text('Staking pool ' + pool);
    modal.find('#pool-not-found').toggleClass('hidden', poolFound);
    modal.find('#pool-found').toggleClass('hidden', !poolFound);

    //modal.find('.modal-body input').val(recipient)
});


async function connectToContract(ownerAccountId, contractId, viewMethods, changeMethods) {
    window.near = await nearAPI.connect({
        deps: {
            keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore()
        },
        ...nearConfig
    });

    window.walletConnection = new nearAPI.WalletConnection(window.near);

    window.contract = await new nearAPI.Contract(window.walletConnection.account(), contractId, {
        viewMethods: viewMethods,
        changeMethods: changeMethods,
        sender: window.walletConnection.getAccountId()
    });


    console.log(window.contract)
    /*


const ownerAccount = await near.account(ownerAccountId);
    // Initializing our contract APIs by contract name and configuration.
    window.contract = await new nearAPI.Contract(ownerAccount, contractId, {
        viewMethods: viewMethods,
        changeMethods: changeMethods,
        sender: ownerAccountId
    });*/
}

function prepareAccountId(data) {
    if (data.toLowerCase().endsWith('.near')) {
        return data.replace('@', '').replace('https://wallet.near.org/send-money/', '').toLowerCase();
    }
    if (data.length == 64 && !data.startsWith('ed25519:')) {
        return data;
    }
    let publicKey;
    if (data.startsWith('NEAR')) {
        publicKey = decode(data.slice(4)).slice(0, -4);
    } else {
        publicKey = decode(data.replace('ed25519:', ''));
    }
    return publicKey.toString('hex');
}

function accountToLockup(masterAccountId, accountId) {
    return `${sha256(Buffer.from(accountId)).toString('hex').slice(0, 40)}.${masterAccountId}`;
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

function errorHelper(err) {
    // if there's a cryptic error, provide more helpful feedback and instructions here
    // TODO: as soon as we get the error codes propagating back, use those
    if (err.message.includes('Cannot deserialize the contract state')) {
        console.warn('NEAR Warning: the contract/account seems to have state that is not (or no longer) compatible.\n' +
            'This may require deleting and recreating the NEAR account as shown here:\n' +
            'https://stackoverflow.com/a/60767144/711863');
    }
    if (err.message.includes('Cannot deserialize the contract state')) {
        console.warn('NEAR Warning: the contract/account seems to have state that is not (or no longer) compatible.\n' +
            'This may require deleting and recreating the NEAR account as shown here:\n' +
            'https://stackoverflow.com/a/60767144/711863');
    }
    console.error(err);
}

function updateUI() {
    if (window.walletConnection.getAccountId()) {
        Array.from(document.querySelectorAll('#after-sign-in-block')).map(it => it.classList.remove("hidden"));
    }
    /*
    if (!window.walletConnection.getAccountId()) {
        Array.from(document.querySelectorAll('#sign-in-block')).map(it => it.classList.remove("hidden"));
    } else {
        Array.from(document.querySelectorAll('#after-sign-in-block')).map(it => it.classList.remove("hidden"));
        /*
        contract.get_num().then(count => {
            document.querySelector('#show').classList.replace('loader', 'number');
            document.querySelector('#show').innerText = count === undefined ? 'calculating...' : count;
            document.querySelector('#left').classList.toggle('eye');
            document.querySelectorAll('button').forEach(button => button.disabled = false);
            if (count >= 0) {
                document.querySelector('.mouth').classList.replace('cry', 'smile');
            } else {
                document.querySelector('.mouth').classList.replace('smile', 'cry');
            }
            if (count > 20 || count < -20) {
                document.querySelector('.tongue').style.display = 'block';
            } else {
                document.querySelector('.tongue').style.display = 'none';
            }
        }).catch(err => errorHelper(err));

    }*/
}

document.querySelector('#plus').addEventListener('click', () => {
    document.querySelectorAll('button').forEach(button => button.disabled = true);
    document.querySelector('#show').classList.replace('number', 'loader');
    document.querySelector('#show').innerText = '';
    contract.increment().then(updateUI);
});
document.querySelector('#minus').addEventListener('click', () => {
    document.querySelectorAll('button').forEach(button => button.disabled = true);
    document.querySelector('#show').classList.replace('number', 'loader');
    document.querySelector('#show').innerText = '';
    contract.decrement().then(updateUI);
});
document.querySelector('#a').addEventListener('click', () => {
    document.querySelectorAll('button').forEach(button => button.disabled = true);
    document.querySelector('#show').classList.replace('number', 'loader');
    document.querySelector('#show').innerText = '';
    contract.reset().then(updateUI);
});
document.querySelector('#c').addEventListener('click', () => {
    document.querySelector('#left').classList.toggle('eye');
});
document.querySelector('#b').addEventListener('click', () => {
    document.querySelector('#right').classList.toggle('eye');
});
document.querySelector('#d').addEventListener('click', () => {
    document.querySelector('.dot').classList.toggle('on');
});

// Log in user using NEAR Wallet on "Sign In" button click
//document.querySelector('#sign-in').addEventListener('click', () => {
//walletConnection.requestSignIn(nearConfig.contractName, 'Near Staking');
//});

document.querySelector('#sign-out').addEventListener('click', () => {
    walletConnection.signOut();
    // TODO: Move redirect to .signOut() ^^^
    window.location.replace(window.location.origin + window.location.pathname);
});

window.nearInitPromise = connect(nearConfig)
    .then(updateUI)
    .catch(console.error);


/*
async function start(lockupAccount) {
  //const account = new nearAPI.Account(nearAPI.connection, lockupAccount);
  //const nearRpc = new nearAPI.providers.JsonRpcProvider('https://rpc.mainnet.near.org');console.log(nearRpc);
  //const account = new nearAPI.Account({ provider: nearRpc });
  const near = await nearAPI.connect({
    deps: {
      //keyStore,
    },
    nodeUrl: "https://rpc.mainnet.near.org",
    networkId: "default"
  });

  const account = await near.account(lockupAccount);
  window.contract1 = await new nearAPI.Contract(account, lockupAccount, {
    viewMethods: [''],
    changeMethods: ["select_staking_pool"],
    sender: ""
  });
}

document.querySelector('#start').addEventListener('click', () => {
    start("9a881619b2bd37617af1255448659c5f512bc0c4.lockup.near").then(()=>{
      window.contract1.select_staking_pool({"staking_pool_account_id": "zavodil.poolv1.near"});
    });
});

async function start(ownerAccountId, lockupAccountId) {
  const near = await nearAPI.connect({
    deps: {
      //keyStore,
    },
    nodeUrl: "https://rpc.mainnet.near.org",
    networkId: "default"
  });

  const ownerAccount = await near.account(ownerAccountId);
  window.contract1 = await new nearAPI.Contract(ownerAccount, lockupAccountId, {
    viewMethods: [''],
    changeMethods: ["select_staking_pool"],
    sender: ownerAccountId
  });
}

document.querySelector('#start').addEventListener('click', () => {
  start("vadim.near", "9a881619b2bd37617af1255448659c5f512bc0c4.lockup.near").then(()=>{
    window.contract1.select_staking_pool({"staking_pool_account_id": "zavodil.poolv1.near"});
  });
});
*/


