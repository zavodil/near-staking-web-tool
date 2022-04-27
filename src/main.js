import "regenerator-runtime/runtime";
import * as nearAPI from "near-api-js";
import getConfig from "./config";
import {sha256} from 'js-sha256';
import Big from 'big.js'

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
    if (percent)
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
}).on('click', "#account-tabs-regular-account-tab", function (e) {
    const controlAmount = $("#near-amount");
    const amount = controlAmount.attr("data-regular-amount");
    if (amount)
        controlAmount.val(amount);

    $('#near-total-amount').text($('#near-total-amount').attr("data-regular"));
    $('#near-deposited-amount').text($('#near-deposited-amount').attr("data-regular"));
    updateNearAmountHint();

    $("#existing-staking-pool-block").addClass("hidden");
    $("#select-staking-pool-block").removeClass("hidden");
    createSelectPoolDataTable();

    $("#deposit-and-stake").removeClass("hidden");
    $("#create-delegation").addClass("hidden");

    $("#create-delegation-pool").addClass("hidden")
    $("#create-delegation-pool-selected").removeClass("hidden")

    $('#near-already-delegated').addClass("hidden");

}).on('click', "#account-tabs-lockup-tab", function (e) {
    const controlAmount = $("#near-amount");
    const amount = controlAmount.attr("data-lockup-amount");
    if (amount)
        controlAmount.val(amount);

    $('#near-total-amount').text($('#near-total-amount').attr("data-lockup"));
    $('#near-deposited-amount').text($('#near-deposited-amount').attr("data-lockup"));
    updateNearAmountHint();

    $("#deposit-and-stake").addClass("hidden");
    $("#create-delegation").removeClass("hidden");

    $("#create-delegation-pool").removeClass("hidden")
    $("#create-delegation-pool-selected").addClass("hidden")

    $('#near-already-delegated').removeClass("hidden");
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


document.querySelector('#deposit-and-stake').addEventListener('click', () => {
    const amount = Number(document.querySelector('#near-amount').value);
    if (window.poolId && window.accountId && amount) {
        document.querySelector('#create-delegation').setAttribute("disabled", "");
        document.querySelector('#create-delegation-hint').classList.remove('hidden');
        const amountNear = nearAPI.utils.format.parseNearAmount(document.querySelector('#near-amount').value);
        window.walletConnection.requestSignIn(window.accountId, 'NEAR Staking');
        connectToContract(window.accountId, poolId, [], ['deposit_and_stake']).then(() => {
            let log = window.contract.deposit_and_stake({}, null, amountNear).then((result) => {

                if (result) {
                    document.querySelector('#create-delegation-result-success').classList.remove('hidden');
                    document.querySelector('#create-delegation-result-failed').classList.add('hidden');
                } else {
                    document.querySelector('#create-delegation-result-failed').classList.remove('hidden');
                    document.querySelector('#create-delegation-result-success').classList.add('hidden');
                }

                document.querySelector('#create-delegation').removeAttribute("disabled");
                document.querySelector('#create-delegation-hint').classList.add('hidden');
                document.querySelector('#create-delegation-result-block').classList.remove('hidden');
            });
        });
    }
});

document.querySelector('#load-account').addEventListener('click', () => {
    window.accountId = prepareAccountId(document.querySelector('#near-account').value);
    window.lockupAccountId = accountToLockup('lockup.near', window.accountId);

    const isLoggedIn = window.walletConnection.getAccountId() === window.accountId;


    //window.walletConnection = new nearAPI.WalletConnection(window.near);
    /*
    const account = window.walletConnection.getAccount(window.accountId);
    const balance = account.getAccountBalance().then((balance) => {
        console.log("get_balance");
        console.log(balance);
    });
     */


    if (isLoggedIn) {
        if (window.walletConnection.getAccountId() === window.accountId) {
            window.walletConnection.account().getAccountBalance().then((balance) => {
                const remainingAmount = Math.max(0, (Number(balance.total) / NearCoef) - 36);
                $("#near-amount").attr("data-regular-amount", remainingAmount);
                document.querySelector('#regular-account-name').innerHTML = `<a href="https://wallet.near.org/profile/${window.accountId}" target="_blank">${window.accountId}</a>`;

                $('#near-total-amount').attr("data-regular", Math.max(0, (Number(balance.total) / NearCoef)));
                $('#near-deposited-amount').attr("data-regular", Math.max(0, (Number(balance.stateStaked) / NearCoef)));
                console.log(window.walletConnection.account());
                console.log(balance);

                $(".regular-account-hint").removeClass("hidden");
                $(".regular-account-not-logged-in").addClass("hidden");
            });
        }
    } else {
        $(".regular-account-hint").addClass("hidden");
        $(".regular-account-not-logged-in").removeClass("hidden");
    }

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
                    $("#near-amount").attr("data-lockup-amount", remainingAmount);
                    document.querySelector('#near-amount').value = remainingAmount;
                    document.querySelector('#near-total-amount').innerHTML = totalAmountFormatted;
                    $('#near-total-amount').attr("data-lockup", totalAmountFormatted);
                    document.querySelector('#near-deposited-amount').innerHTML = depositedAmountFormatted;
                    $('#near-deposited-amount').attr("data-lockup", depositedAmountFormatted);
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
                            document.querySelector('#existing-staking-pool-block').classList.add('hidden');

                            createSelectPoolDataTable();

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

function createSelectPoolDataTable() {
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
            {data: "vote", visible: false},
            {data: "stake"},
            {data: "stake", visible: false}
        ],
        ajax: "pools.txt",
        createdRow: function (row, data, dataIndex) {
            const $dateCell = $(row).find('td:eq(4)');
            const item = $dateCell.text();
            $dateCell
                .data('order', item)
                .html(Number(item).toLocaleString() + "&nbsp;Ⓝ");

            /*
            const $voteCell = $(row).find('td:eq(4)');
            const vote = $voteCell.text();
            $voteCell
                .data('order', Number(data.vote))
                .html(Number(vote) ? `<i class="fa fa-check green" aria-hidden="true"></i>` : `<i class="fa fa-times red" aria-hidden="true"></i>`)
            */
        }
    });
}

const queryString = window.location.search;
if (queryString.startsWith("?address=")) {
    const address = queryString.substr("?address=".length);
    document.querySelector('.container.main').classList.remove('hidden');
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.stake').classList.add('hidden');
    document.querySelector('.container.nft').classList.add('hidden');
    document.querySelector('.container.aurora').classList.add('hidden');
    document.querySelector('.container.usn').classList.add('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.add('active');
    document.querySelector('#nav-stake').classList.remove('active');
    document.querySelector('#nav-nft').classList.remove('active');
    document.querySelector('#nav-aurora').classList.remove('active');
    document.querySelector('#usn').classList.remove('active');


    document.querySelector('#near-account').value = address;
    setTimeout(() => {
        $("#load-account").trigger("click")
    }, 0);
} else if (queryString.includes("pools")) {
    document.querySelector('.container.main').classList.add('hidden');
    document.querySelector('.container.pools').classList.remove('hidden');
    document.querySelector('.container.stake').classList.add('hidden');
    document.querySelector('.container.nft').classList.add('hidden');
    document.querySelector('.container.aurora').classList.add('hidden');
    document.querySelector('.container.usn').classList.add('hidden');
    document.querySelector('#nav-main').classList.remove('active');
    document.querySelector('#nav-pools').classList.add('active');
    document.querySelector('#nav-stake').classList.remove('active');
    document.querySelector('#nav-nft').classList.remove('active');
    document.querySelector('#nav-aurora').classList.remove('active');
    document.querySelector('#nav-usn').classList.remove('active');


    window.pools_table = $('#view-pools-table').DataTable({
        destroy: true,
        pageLength: 100,
        rowId: "account_id",
        sortable: true,
        columnDefs: [
            {"sorting": ["desc", "asc"], "targets": [5, 6, 7, 8, 9, 10]},
            {"sorting": ["asc", "desc"], "targets": [1, 4]},
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
            {data: "vote", class: "col-phase-2-vote", visible: false},
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
                    //document.querySelector('#seat-price').classList.remove('hidden');
                    //document.querySelector('#seat-price-value').innerText = Number(json.seat_price).toLocaleString();
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

                window.poolJson = json.data;

                return json.data;
            },
        },
        rowCallback: function (row, data, displayNum, displayIndex, dataIndex) {
            $(row).toggleClass("row-kickout", !data.status);

            if (data.stake_percent) {
                let staked_by_others = 0;
                const all_nodes = window.pools_table.rows({order: 'applied'}).nodes();

                for (let i = 0; i < displayIndex; i++)
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
                                rowData.country_code = `<ul class="f16"><li title="${data[pool].country_code}" class="flag ${data[pool].country_code.toLowerCase()}"></li></ul>`;
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

            /*
            let voted = 0; let total_voted = 0;
            if (window.pools_table) {
                const data = window.pools_table.data();
                for (let index in data) {
                    const item = data[index];
                    if (item.status) {
                        if (item.vote)
                            voted += item.stake;
                        total_voted += item.stake;
                    }
                }

                const res = (voted / total_voted * 100).toFixed(2) + "%";
                $(this.api().column(6).footer()).html(res);

                $(".container.pools .dataTables_length").html("Phase 2 vote: " + res).css("padding-top", "10px").css("padding-left", "17px").show();
            }
             */
        }
    });

} else if (queryString.includes("stake")) {
    document.querySelector('.container.main').classList.add('hidden');
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.stake').classList.remove('hidden');
    document.querySelector('.container.nft').classList.add('hidden');
    document.querySelector('.container.aurora').classList.add('hidden');
    document.querySelector('.container.usn').classList.add('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.remove('active');
    document.querySelector('#nav-stake').classList.add('active');
    document.querySelector('#nav-nft').classList.remove('active');
    document.querySelector('#nav-aurora').classList.remove('active');
    document.querySelector('#nav-usn').classList.remove('active');


} else if (queryString.includes("nft")) {
    document.querySelector('.container.main').classList.add('hidden');
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.stake').classList.add('hidden');
    document.querySelector('.container.nft').classList.remove('hidden');
    document.querySelector('.container.aurora').classList.add('hidden');
    document.querySelector('.container.usn').classList.add('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.remove('active');
    document.querySelector('#nav-stake').classList.remove('active');
    document.querySelector('#nav-nft').classList.add('active');
    document.querySelector('#nav-aurora').classList.remove('active');
    document.querySelector('#nav-usn').classList.remove('active');


    if (queryString.startsWith("?nft=")) {
        let near_account_id = queryString.substr("?nft=".length);
        if(near_account_id.indexOf("&") !== -1 ) {
            near_account_id = near_account_id.substring(0, near_account_id.indexOf("&"));
        }
        if(near_account_id) {
            document.querySelector('#nft-account-id').value = near_account_id;
            setTimeout(() => {
                $("#nft-check-button").trigger("click")
            }, 0);
        }
    }
} else if (queryString.includes("aurora")) {
    document.querySelector('.container.main').classList.add('hidden');
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.stake').classList.add('hidden');
    document.querySelector('.container.nft').classList.add('hidden');
    document.querySelector('.container.aurora').classList.remove('hidden');
    document.querySelector('.container.usn').classList.add('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.remove('active');
    document.querySelector('#nav-stake').classList.remove('active');
    document.querySelector('#nav-nft').classList.remove('active');
    document.querySelector('#nav-aurora').classList.add('active');
    document.querySelector('#nav-usn').classList.remove('active');

    document.querySelector('#aurora-account-id').value = window.localStorage.getItem('aurora_account_id') || "";
} else if (queryString.includes("usn")) {
    document.querySelector('.container.main').classList.add('hidden');
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.stake').classList.add('hidden');
    document.querySelector('.container.nft').classList.add('hidden');
    document.querySelector('.container.aurora').classList.add('hidden');
    document.querySelector('.container.usn').classList.remove('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.remove('active');
    document.querySelector('#nav-stake').classList.remove('active');
    document.querySelector('#nav-nft').classList.remove('active');
    document.querySelector('#nav-aurora').classList.remove('active');
    document.querySelector('#nav-usn').classList.add('active');

    document.querySelector('#usn-account-id').value = window.localStorage.getItem('usn_account_id') || "";
} else {
    document.querySelector('.container.main').classList.remove('hidden');
    document.querySelector('.container.pools').classList.add('hidden');
    document.querySelector('.container.stake').classList.add('hidden');
    document.querySelector('.container.nft').classList.remove('hidden');
    document.querySelector('.container.aurora').classList.add('hidden');
    document.querySelector('#nav-pools').classList.remove('active');
    document.querySelector('#nav-main').classList.add('active');
    document.querySelector('#nav-stake').classList.remove('active');
    document.querySelector('#nav-nft').classList.remove('active');
}

async function connectToPoolContract() {
    if (!window.zavodil_pool_details) {
        window.zavodil_pool_details = await new nearAPI.Contract(
            window.walletConnection.account(), "zavodil.poolv1.near", {
                viewMethods: ['get_account_staked_balance'],
                changeMethods: [],
                sender: window.walletConnection.getAccountId()
            });
    }
}

async function connectUSNContract() {
    if (!window.usn_contract) {
        window.usn_contract = await new nearAPI.Contract(
            window.walletConnection.account(), "usn", {
                viewMethods: ['ft_balance_of'],
                changeMethods: ['claim'],
                sender: window.walletConnection.getAccountId()
            });
    }
}

async function connectAuroraPoolContract() {
    if (!window.aurora_pool_details) {
        window.aurora_pool_details = await new nearAPI.Contract(
            window.walletConnection.account(), "aurora.pool.near", {
                viewMethods: ['get_unclaimed_reward'],
                changeMethods: ['claim'],
                sender: window.walletConnection.getAccountId()
            });
    }
}

async function connectAuroraTokenContract() {
    if (!window.aurora_token_details) {
        window.aurora_token_details = await new nearAPI.Contract(
            window.walletConnection.account(), "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near", {
                viewMethods: ['storage_balance_of'],
                changeMethods: ['storage_deposit'],
                sender: window.walletConnection.getAccountId()
            });
    }
}

async function connectToClaimNFTContract() {
    if (!window.zavodil_nft_details) {
        window.zavodil_nft_details = await new nearAPI.Contract(
            window.walletConnection.account(),
            "zavodil.node.staking.near", {
                viewMethods: ['get_available_token', 'nft_tokens_for_owner'],
                changeMethods: ['nft_mint'],
                sender: window.walletConnection.getAccountId()
            });
    }
}

document.getElementById("nft-account-id").addEventListener("keydown", checkNearAccountKeyDown, false);
document.getElementById("nft-check-button").addEventListener("click", checkNearAccount, false);
document.getElementById("nft-claim-button").addEventListener("click", claimNFT, false);

document.getElementById("aurora-account-id").addEventListener("keydown", checkAuroraNearAccountKeyDown, false);
document.getElementById("aurora-check-button").addEventListener("click", checkAuroraAccount, false);
document.getElementById("aurora-claim-button").addEventListener("click", claimAurora, false);
document.getElementById("aurora-storage-deposit-button").addEventListener("click", depositAndClaimAurora, false);

document.getElementById("usn-account-id").addEventListener("keydown", checkUsnNearAccountKeyDown, false);
document.getElementById("usn-check-button").addEventListener("click", loadUSNBalances, false);
document.getElementById("usn-unwrap-button").addEventListener("click", usnUnwrap, false);
document.getElementById("usn-wrap-button").addEventListener("click", usnWrap, false);

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

function showUsnNearAmount(amount_near, account_id) {
    console.log(`NEAR balance ${amount_near.toFixed(4)}`)

    document.querySelector('#check-usn-error').classList.add('hidden');
    document.getElementById('usn-near-amount').value = amount_near.toFixed(4);
    if (parseFloat(amount_near.toFixed(4)) > 0) {
        document.querySelector('#usn-wrap-button').classList.remove('hidden');
        document.querySelector('#usn-wrap-button').setAttribute('account-id', account_id);
        document.querySelector('#check-usn-found').classList.remove('hidden');
        document.getElementById('usn-claim-hint').innerHTML = `Double check transaction details before to sign with account <code>${account_id}</code>`;
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
            `https://near.zavodil.ru/`,
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
            `https://near.zavodil.ru/`,
            "mainnet");

        window.location.replace(url);
    }
}




async function checkNearAccountKeyDown(e) {
    e = e || window.event;
    if (e.keyCode == 13) {
        await checkNearAccount();
    }
}

async function checkAuroraNearAccountKeyDown(e) {
    e = e || window.event;
    if (e.keyCode == 13) {
        await checkAuroraAccount();
    }
}

async function checkUsnNearAccountKeyDown(e) {
    e = e || window.event;
    if (e.keyCode == 13) {
        await loadUSNBalances();
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

async function claimNFT() {
    const account_id = document.querySelector('#nft-account-id').value;
    const is_lockup = document.getElementById('nft-check-lockup').checked;

    let params = {
        receiver_id: account_id
    };

    if(is_lockup){
        params.is_lockup = is_lockup;
    }

    let url = await GetSignUrl(
        account_id,
        "nft_mint",
        params,
        nearAPI.utils.format.parseNearAmount("0.01"),
        200000000000000,
        "zavodil.node.staking.near",
        null,
        `https://near.zavodil.ru/?nft=${account_id}`,
        "mainnet");

    window.location.replace(url);
}

async function checkAuroraAccount() {
    document.querySelector("#aurora-check-loading").classList.remove('hidden');
    await connectAuroraPoolContract();

    let account_id = document.querySelector('#aurora-account-id').value;

    window.localStorage.setItem('aurora_account_id', account_id);

    if(account_id) {
        window.aurora_pool_details.get_unclaimed_reward({account_id, farm_id: 0})
            .then(async amount => {
                await showAuroraAmount(amount, account_id);
            })
            .catch(err => {
                console.log(err)
                document.querySelector("#aurora-check-loading").classList.add('hidden');
                document.querySelector('#check-aurora-found').classList.add('hidden');
                document.querySelector('#check-aurora-error').classList.remove('hidden');
            });
    }
}


async function showAuroraAmount(amount, account_id){
    let amount_aurora = (Math.round(amount / 10000000000) / 100000000);
    console.log(`Staking balance ${amount_aurora.toFixed(4)}`)


    document.querySelector('#check-aurora-error').classList.add('hidden');

    if (amount_aurora > 0) {
        document.getElementById('aurora-amount').innerHTML = amount_aurora.toFixed(4);
        document.querySelector('#check-aurora-found').classList.remove('hidden');

        await connectAuroraTokenContract();
        window.aurora_token_details.storage_balance_of({account_id}).then(storage_balance => {
            console.log(`Storage Deposit for Aurora token:`);
            console.log(storage_balance);

            if(!!storage_balance?.total) {
                document.querySelector('#aurora-claim-button').classList.remove('hidden');
                document.querySelector('#aurora-claim-button').setAttribute('account-id', account_id);
                document.querySelector('#aurora-storage-deposit-button').classList.add('hidden');
            }
            else{
                document.querySelector('#aurora-claim-button').classList.add('hidden');
                document.querySelector('#aurora-storage-deposit-button').classList.remove('hidden');
                document.querySelector('#aurora-storage-deposit-button').setAttribute('account-id', account_id);
            }

            document.getElementById('aurora-claim-hint').innerHTML = `Double check transaction details before to sign with account <code>${account_id}</code>`;
        })

    } else {
        document.querySelector('#check-aurora-error').classList.remove('hidden');
        document.querySelector('#check-aurora-found').classList.add('hidden');
    }

    document.querySelector("#aurora-check-loading").classList.add('hidden');
}

async function claimAurora() {
    const account_id = document.querySelector('#aurora-claim-button').getAttribute('account-id')
    if(account_id) {
        await connectAuroraPoolContract();

        let url = await GetSignUrl(
            account_id,
            "claim",
            {"token_id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near", "farm_id": 0},
            nearAPI.utils.format.parseNearAmount("0.000000000000000000000001"),
            200000000000000,
            "aurora.pool.near",
            null,
            `https://near.zavodil.ru/`,
            "mainnet");

        window.location.replace(url);
    }
}

async function depositAndClaimAurora() {
    const account_id = document.querySelector('#aurora-storage-deposit-button').getAttribute('account-id')
    if(account_id) {
        await connectAuroraPoolContract();

        let url = await GetSignUrl(
            account_id,
            ["storage_deposit", "claim"],
            [{account_id}, {"token_id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near", "farm_id": 0}],
            [nearAPI.utils.format.parseNearAmount("0.0125"), nearAPI.utils.format.parseNearAmount("0.000000000000000000000001")],
            [100000000000000, 100000000000000],
            ["aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near", "aurora.pool.near"],
                null,
                `https://near.zavodil.ru/`,
                "mainnet");


        window.location.replace(url);
    }
}

async function checkNearAccount() {
    document.querySelector("#nft-check-loading").classList.remove('hidden');
    await connectToPoolContract();

    let account_id = document.querySelector('#nft-account-id').value;
    let staking_account_id = account_id;

    const is_lockup = document.getElementById('nft-check-lockup').checked;
    console.log(is_lockup)
    if(is_lockup){
        staking_account_id = accountToLockup('lockup.near', account_id);
        console.log(`Use lockup: ${account_id}`);
    }

    if(account_id) {
        window.zavodil_pool_details.get_account_staked_balance({account_id: staking_account_id})
            .then(async amount => {
                await showStaking(amount, account_id, staking_account_id);
            })
            .catch(err => {
                console.log(err)
                document.querySelector("#nft-check-loading").classList.add('hidden');
                document.querySelector('#check-nft-staking-not-found').classList.add('hidden');
                document.querySelector('#check-nft-staking-found').classList.add('hidden');
                document.querySelector('#check-nft-error').classList.remove('hidden');
            });
    }
}

let all_nfts = {
    "Early NEAR Delegator": 1,
    "Honored NEAR Delegator": 2,
    "Premium NEAR Delegator": 3,
    "Legendary NEAR Delegator": 4,
};

async function showStaking(amount, account_id, staking_account_id){
    await connectToClaimNFTContract();
    console.log(`Staking balance ${nearAPI.utils.format.formatNearAmount(amount, )}`)
    let staked_amount = Big(amount);

    let existing_tokens = await window.zavodil_nft_details.nft_tokens_for_owner({account_id});
    let available_token = await window.zavodil_nft_details.get_available_token({
        staked_amount: amount,
        account_id
    });

    document.querySelector("#nft-check-loading").classList.add('hidden');
    document.querySelector('#check-nft-error').classList.add('hidden');

    console.log(existing_tokens);
    console.log(available_token);

    let allow_to_claim = !!available_token && available_token.hasOwnProperty('title');
    if (allow_to_claim) {
        let max_existing_tokens_level = 0;
        for (let token_index in existing_tokens) {
            let existing_nft_level = all_nfts[existing_tokens[token_index].metadata.title];
            max_existing_tokens_level = Math.max(max_existing_tokens_level, existing_nft_level);
        }

        console.log(`NFT level ${max_existing_tokens_level} found`);

        allow_to_claim = all_nfts[available_token.title] > max_existing_tokens_level;
    }

    if (allow_to_claim && staked_amount.gt(0)) {
        document.querySelector('#check-nft-staking-not-found').classList.add('hidden');

        if (allow_to_claim) {
            document.querySelector('#nft-account-id').setAttribute('disabled', 'disabled');
            document.querySelector('#nft-check-lockup').setAttribute('disabled', 'disabled');
            document.querySelector('#nft-check-button').setAttribute('disabled', 'disabled');
            document.getElementById('nft-claim-hint').innerHTML = `<code>Sign transaction with ${account_id} only</code>`;
        }

        document.querySelector('#check-nft-exists').classList.add('hidden');
        document.querySelector('#check-nft-staking-found').classList.toggle('hidden', !allow_to_claim);
    } else {
        if (existing_tokens && existing_tokens.length) {
            document.querySelector('#check-nft-exists').classList.remove('hidden');
            document.querySelector('#check-nft-staking-not-found').classList.add('hidden');
            document.querySelector('#check-nft-staking-found').classList.add('hidden');

            document.getElementById('check-nft-exists-media').innerHTML =
                existing_tokens
                    .map(token => `<div class="nft-token"><img src="https://pluminite.mypinata.cloud/ipfs/${token.metadata.media}" alt="NFT"><br />${token.metadata.title}</div>`)
                    .join();

            let token = existing_tokens[existing_tokens.length - 1];
            document.getElementById('my-nft-twit').innerHTML = "";
            twttr.widgets.createShareButton('https://near.zavodil.ru/?nft',
                document.getElementById('my-nft-twit'),
                {
                    size: 'large',
                    related: 'zavodil_ru',
                    text: `I just claimed ${token.metadata.title} NFT! Stake NEAR with Zavodil node with ~12% APY & lowest 1% service fee and claim NFT! #FutureIsNEAR @zavodil_ru`,
                    attached: `https://pluminite.mypinata.cloud/ipfs/${token.metadata.media}`,
                    dnt: true,
                }
            );
        } else {
            document.querySelector('#check-nft-exists').classList.add('hidden');
            document.querySelector('#check-nft-staking-not-found').classList.remove('hidden');
            document.querySelector('#check-nft-staking-found').classList.add('hidden');
        }
    }
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


