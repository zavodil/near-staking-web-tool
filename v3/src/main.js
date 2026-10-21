import "regenerator-runtime/runtime";
import { NearConnector } from "@hot-labs/near-connect";
import { sha256 } from "js-sha256";
import Big from "big.js";

const SITE_URL = "https://zavodil.near.page/";
const POOL_ID = "zavodil.poolv1.near";
const NFT_CONTRACT_ID = "zavodil.node.staking.near";
const POOL_DETAILS_ID = "pool-details.near";
const EXPLORER = "https://nearblocks.io";
const RPC_URLS = ["https://rpc.mainnet.fastnear.com", "https://rpc.mainnet.near.org"];

const TGAS = "000000000000";
const STAKING_GAS = "125" + TGAS;
const NFT_GAS = "200" + TGAS;
const YOCTO = Big(10).pow(24);
// Storage costs 10^19 yoctoNEAR per byte; keep a little extra for gas.
const STORAGE_PRICE_PER_BYTE = Big(10).pow(19);
const GAS_RESERVE = Big("50000000000000000000000"); // 0.05 NEAR
// Ignore unstaked dust (rounding leftovers) below 0.001 NEAR.
const MIN_UNSTAKED = Big("1000000000000000000000");

// ========================================
// Helpers
// ========================================

const $id = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Only allow http(s) links from untrusted on-chain data.
function safeUrl(value) {
    if (!value) return null;
    const raw = /^https?:\/\//i.test(value) ? value : "https://" + value;
    try {
        const url = new URL(raw);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

// Long (e.g. 64-char implicit) account ids: keep the start and the end, cut the middle.
function shortAccount(accountId, max = 24) {
    if (!accountId || accountId.length <= max) return accountId || "";
    return `${accountId.slice(0, 8)}…${accountId.slice(-8)}`;
}

function setAccountText(id, accountId) {
    const el = $id(id);
    if (!el) return;
    el.textContent = shortAccount(accountId);
    el.title = accountId || "";
}

function formatNear(yocto, decimals = 4) {
    const value = Big(yocto || 0).div(YOCTO);
    const fixed = value.round(decimals, Big.roundDown).toFixed(decimals);
    const [int, frac] = fixed.split(".");
    const intFormatted = Number(int).toLocaleString("en-US");
    const fracTrimmed = frac ? frac.replace(/0+$/, "") : "";
    return fracTrimmed ? `${intFormatted}.${fracTrimmed}` : intFormatted;
}

function parseNear(input) {
    const value = String(input || "").trim().replace(",", ".");
    if (!/^\d+(\.\d{0,24})?$/.test(value)) return null;
    const yocto = Big(value).times(YOCTO);
    return yocto.gt(0) ? yocto.toFixed(0) : null;
}

// ========================================
// RPC (read-only, no wallet needed)
// ========================================

async function rpc(method, params) {
    let lastError;
    for (const url of RPC_URLS) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: "dontcare", method, params })
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error.data || json.error.message || JSON.stringify(json.error));
            if (json.result?.error) throw new Error(json.result.error);
            return json.result;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
}

async function viewCall(contractId, methodName, args = {}) {
    const result = await rpc("query", {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contractId,
        method_name: methodName,
        args_base64: btoa(JSON.stringify(args))
    });
    return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result)));
}

async function viewAccount(accountId) {
    return rpc("query", { request_type: "view_account", finality: "optimistic", account_id: accountId });
}

function accountToLockup(masterAccountId, accountId) {
    return `${sha256(accountId).slice(0, 40)}.${masterAccountId}`;
}

// ========================================
// Routing
// ========================================

const sections = {
    main: "#section-main",
    stake: "#section-stake",
    nft: "#section-nft",
    pools: "#section-pools"
};

const navItems = {
    main: "#nav-main",
    stake: "#nav-stake",
    nft: "#nav-nft",
    pools: "#nav-pools"
};

let currentSection = null;

function showSection(sectionKey) {
    currentSection = sectionKey;
    Object.values(sections).forEach((selector) => document.querySelector(selector)?.classList.add("hidden"));
    Object.values(navItems).forEach((selector) => document.querySelector(selector)?.classList.remove("active"));
    document.querySelector(sections[sectionKey])?.classList.remove("hidden");
    document.querySelector(navItems[sectionKey])?.classList.add("active");
    $id("nav-menu")?.classList.remove("active");
    $id("nav-toggle")?.classList.remove("active");
}

let poolsTableInitialized = false;

// Called once at the end of the module (after all state is declared) and on back/forward.
function route() {
    const params = new URLSearchParams(window.location.search);

    if (params.has("pools")) {
        showSection("pools");
        if (!poolsTableInitialized) {
            poolsTableInitialized = true;
            initPoolsTable();
        }
    } else if (params.has("nft")) {
        showSection("nft");
        const nearAccountId = params.get("nft");
        if (nearAccountId) {
            $id("nft-account-id").value = nearAccountId;
            setTimeout(() => $id("nft-check-button").click(), 500);
        }
    } else if (params.has("stake")) {
        showSection("stake");
        setStakeMode(params.get("stake") === "unstake" ? "unstake" : "stake");
        loadPoolStats();
    } else {
        showSection("main");
        loadPoolStats();
    }
}

window.addEventListener("popstate", route);

// ========================================
// Animations
// ========================================

const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
            fadeObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

document.querySelectorAll(".stat-card, .feature-card").forEach((el, index) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(30px)";
    el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
    fadeObserver.observe(el);
});

const parallaxLayers = document.querySelectorAll(".parallax-layer");
let ticking = false;

function updateParallax() {
    const scrollY = window.scrollY;
    parallaxLayers.forEach((layer) => {
        let speed = 0.05;
        if (layer.classList.contains("parallax-slow")) speed = 0.03;
        else if (layer.classList.contains("parallax-medium")) speed = 0.06;
        else if (layer.classList.contains("parallax-fast")) speed = 0.1;
        layer.style.transform = `translateY(${scrollY * speed}px)`;
    });
    ticking = false;
}

window.addEventListener("scroll", () => {
    if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
    }
}, { passive: true });

// ========================================
// Live pool stats (main page)
// ========================================

function setText(id, text) {
    const el = $id(id);
    if (el) el.textContent = text;
}

function setClassText(className, text) {
    document.querySelectorAll("." + className).forEach((el) => (el.textContent = text));
}

let poolStatsLoaded = false;

async function loadPoolStats() {
    if (poolStatsLoaded) return;
    poolStatsLoaded = true;

    const [staked, delegators, fee] = await Promise.allSettled([
        viewCall(POOL_ID, "get_total_staked_balance"),
        viewCall(POOL_ID, "get_number_of_accounts"),
        viewCall(POOL_ID, "get_reward_fee_fraction")
    ]);

    setClassText("live-staked", staked.status === "fulfilled" ? `${formatNear(staked.value, 0)} ⋈` : "—");

    if (delegators.status === "fulfilled") {
        const count = Number(delegators.value).toLocaleString("en-US");
        setClassText("live-delegators", count);
        setClassText("live-delegators-badge", `${count} delegators on-chain`);
    } else {
        setClassText("live-delegators", "—");
    }

    if (fee.status === "fulfilled" && fee.value.denominator) {
        const percent = Big(fee.value.numerator).times(100).div(fee.value.denominator);
        setClassText("live-fee", `${Number(percent.toFixed(2))}%`);
    } else {
        setClassText("live-fee", "—");
    }
}

// ========================================
// Wallet (NEAR Connect)
// ========================================

const connector = new NearConnector({
    network: "mainnet",
    providers: { mainnet: RPC_URLS },
    features: { signAndSendTransaction: true },
    footerBranding: null
});

const walletState = { accountId: null };
const walletListeners = [];

function onWalletChange(cb) {
    walletListeners.push(cb);
}

function setAccount(accountId) {
    walletState.accountId = accountId || null;
    walletListeners.forEach((cb) => cb(walletState.accountId));
}

connector.on("wallet:signIn", (event) => setAccount(event?.accounts?.[0]?.accountId));
connector.on("wallet:signOut", () => setAccount(null));

async function restoreSession() {
    try {
        await connector.whenManifestLoaded;
        const { accounts } = await connector.getConnectedWallet();
        setAccount(accounts?.[0]?.accountId);
    } catch {
        setAccount(null);
    }
}

async function connectWallet() {
    try {
        await connector.whenManifestLoaded;
        await connector.connect();
    } catch (err) {
        console.warn("Wallet connect cancelled or failed:", err);
    }
}

async function disconnectWallet() {
    try {
        await connector.disconnect();
    } catch (err) {
        console.warn("Disconnect failed:", err);
    }
    setAccount(null);
}

function getTxHash(outcome) {
    return outcome?.transaction?.hash || outcome?.transaction_outcome?.id || null;
}

function getTxFailure(outcome) {
    const status = outcome?.status;
    if (status && typeof status === "object" && status.Failure) {
        return JSON.stringify(status.Failure);
    }
    return null;
}

async function sendFunctionCall(receiverId, methodName, args, deposit, gas) {
    const wallet = await connector.wallet();
    const outcome = await wallet.signAndSendTransaction({
        signerId: walletState.accountId,
        receiverId,
        actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }]
    });
    const failure = getTxFailure(outcome);
    if (failure) {
        const err = new Error(failure);
        err.txHash = getTxHash(outcome);
        throw err;
    }
    return outcome;
}

// Navbar wallet button
const navWalletBtn = $id("nav-wallet-button");
navWalletBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (walletState.accountId) disconnectWallet();
    else connectWallet();
});

onWalletChange((accountId) => {
    if (!navWalletBtn) return;
    if (accountId) {
        navWalletBtn.innerHTML = `<i class="fas fa-wallet"></i><span class="wallet-account" title="${escapeHtml(accountId)}">${escapeHtml(shortAccount(accountId))}</span><i class="fas fa-right-from-bracket"></i>`;
        navWalletBtn.title = "Disconnect wallet";
        navWalletBtn.classList.replace("btn-primary", "btn-secondary");
    } else {
        navWalletBtn.innerHTML = `<i class="fas fa-wallet"></i><span>Connect Wallet</span>`;
        navWalletBtn.title = "";
        navWalletBtn.classList.replace("btn-secondary", "btn-primary");
    }
});

// ========================================
// Staking widget
// ========================================

const stakeState = {
    mode: "stake",
    available: "0",
    staked: "0",
    unstaked: "0",
    canWithdraw: false,
    busy: false
};

function stakeStatus(kind, html) {
    const el = $id("stake-status");
    if (!el) return;
    if (!kind) {
        el.className = "alert hidden";
        el.innerHTML = "";
        return;
    }
    const icon = { success: "fa-check-circle", error: "fa-exclamation-circle", warning: "fa-info-circle" }[kind];
    el.className = `alert alert-${kind}`;
    el.innerHTML = `<i class="fas ${icon}"></i><div>${html}</div>`;
}

function txLink(hash) {
    return hash ? ` <a href="${EXPLORER}/txns/${encodeURIComponent(hash)}" target="_blank" rel="noopener">View transaction</a>` : "";
}

function setStakeMode(mode) {
    stakeState.mode = mode;
    document.querySelectorAll(".stake-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    $id("stake-submit-label").textContent = mode === "stake" ? "Stake" : "Unstake";
    $id("stake-amount").value = "";
    $id("stake-hint").textContent = mode === "stake"
        ? "Rewards depend on network inflation and total stake. There is no fixed APY."
        : "Unstaked NEAR becomes withdrawable after 4 epochs (~2–3 days).";
    stakeStatus(null);
}

function maxAmount() {
    if (stakeState.mode === "stake") {
        const max = Big(stakeState.available).minus(GAS_RESERVE);
        return max.gt(0) ? max.toFixed(0) : "0";
    }
    return stakeState.staked;
}

async function refreshStakeBalances() {
    const accountId = walletState.accountId;
    if (!accountId) return;

    try {
        const [account, poolAccount] = await Promise.all([
            viewAccount(accountId),
            viewCall(POOL_ID, "get_account", { account_id: accountId })
        ]);
        if (walletState.accountId !== accountId) return;

        const storageLocked = Big(account.storage_usage || 0).times(STORAGE_PRICE_PER_BYTE);
        const available = Big(account.amount).minus(storageLocked);
        stakeState.available = available.gt(0) ? available.toFixed(0) : "0";
        stakeState.staked = poolAccount.staked_balance;
        stakeState.unstaked = poolAccount.unstaked_balance;
        stakeState.canWithdraw = poolAccount.can_withdraw;

        setText("stake-available", formatNear(stakeState.available));
        setText("stake-staked", formatNear(stakeState.staked));
        setText("stake-unstaked", formatNear(stakeState.unstaked));

        const hasUnstaked = Big(stakeState.unstaked).gte(MIN_UNSTAKED);
        $id("stake-unstaked-row").classList.toggle("hidden", !hasUnstaked);
        $id("stake-withdraw").classList.toggle("hidden", !hasUnstaked);
        $id("stake-withdraw").disabled = !stakeState.canWithdraw || stakeState.busy;
        setText("stake-unstaked-note", stakeState.canWithdraw ? "ready to withdraw" : "pending, not withdrawable yet");
        updateMiniCard();
    } catch (err) {
        console.error("Failed to load balances:", err);
        stakeStatus("error", "Could not load balances from RPC. Try again later.");
    }
}

// Switch to the stake page without a reload, pick the tab and open the wallet selector if needed.
async function goToStake(action) {
    const mode = action === "unstake" || action === "withdraw" ? "unstake" : "stake";
    const url = mode === "unstake" ? "?stake=unstake" : "?stake";
    if (currentSection !== "stake" || window.location.search !== url) {
        history.pushState(null, "", url);
    }
    showSection("stake");
    loadPoolStats();
    setStakeMode(mode);
    window.scrollTo({ top: 0 });

    if (!walletState.accountId) await connectWallet();
    if (!walletState.accountId) return;

    if (action === "withdraw" && stakeState.canWithdraw && Big(stakeState.unstaked).gte(MIN_UNSTAKED)) {
        submitWithdraw();
    } else {
        $id("stake-amount").focus({ preventScroll: true });
    }
}

document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-stake-go]");
    if (!trigger) return;
    e.preventDefault();
    goToStake(trigger.dataset.stakeGo);
});

function updateMiniCard() {
    const connected = !!walletState.accountId;
    $id("stake-mini").classList.toggle("is-connected", connected);
    $id("mini-disconnected").classList.toggle("hidden", connected);
    $id("mini-connected").classList.toggle("hidden", !connected);
    setAccountText("mini-account", walletState.accountId);
    if (!connected) return;

    setText("mini-staked", formatNear(stakeState.staked, 2));
    let sub = `Available: ${formatNear(stakeState.available, 2)} NEAR`;
    const hasUnstaked = Big(stakeState.unstaked).gte(MIN_UNSTAKED);
    if (hasUnstaked && !stakeState.canWithdraw) {
        sub += ` · ${formatNear(stakeState.unstaked, 2)} NEAR unstaking`;
    }
    setText("mini-sub", sub);
    setText("mini-withdraw-amount", formatNear(stakeState.unstaked, 3));
    $id("mini-withdraw").classList.toggle("hidden", !(hasUnstaked && stakeState.canWithdraw));
}

function setBusy(busy) {
    stakeState.busy = busy;
    $id("stake-submit").disabled = busy;
    $id("stake-withdraw").disabled = busy || !stakeState.canWithdraw;
    $id("stake-submit").classList.toggle("loading", busy);
}

async function submitStake() {
    if (stakeState.busy) return;
    const input = $id("stake-amount").value;
    const isMax = $id("stake-amount").dataset.max === "1";
    let amount = parseNear(input);

    if (!amount) {
        stakeStatus("error", "Enter a valid amount.");
        return;
    }
    const limit = maxAmount();
    if (isMax) amount = limit;
    if (Big(amount).gt(limit)) {
        stakeStatus("error", `Amount exceeds ${stakeState.mode === "stake" ? "available balance (minus 0.05 NEAR for gas)" : "staked balance"}.`);
        return;
    }

    setBusy(true);
    stakeStatus("warning", "Confirm the transaction in your wallet…");
    try {
        let outcome;
        if (stakeState.mode === "stake") {
            outcome = await sendFunctionCall(POOL_ID, "deposit_and_stake", {}, amount, STAKING_GAS);
            stakeStatus("success", `Staked ${formatNear(amount)} NEAR.${txLink(getTxHash(outcome))}`);
        } else if (isMax) {
            outcome = await sendFunctionCall(POOL_ID, "unstake_all", {}, "0", STAKING_GAS);
            stakeStatus("success", `Unstaked all NEAR. Withdraw will be available in ~4 epochs.${txLink(getTxHash(outcome))}`);
        } else {
            outcome = await sendFunctionCall(POOL_ID, "unstake", { amount }, "0", STAKING_GAS);
            stakeStatus("success", `Unstaked ${formatNear(amount)} NEAR. Withdraw will be available in ~4 epochs.${txLink(getTxHash(outcome))}`);
        }
        $id("stake-amount").value = "";
        delete $id("stake-amount").dataset.max;
    } catch (err) {
        console.error(err);
        stakeStatus("error", `Transaction failed or was rejected: ${escapeHtml(err?.message || err)}${txLink(err?.txHash)}`);
    } finally {
        setBusy(false);
        refreshStakeBalances();
    }
}

async function submitWithdraw() {
    if (stakeState.busy) return;
    setBusy(true);
    stakeStatus("warning", "Confirm the transaction in your wallet…");
    try {
        const outcome = await sendFunctionCall(POOL_ID, "withdraw_all", {}, "0", STAKING_GAS);
        stakeStatus("success", `Withdrawn ${formatNear(stakeState.unstaked)} NEAR.${txLink(getTxHash(outcome))}`);
    } catch (err) {
        console.error(err);
        stakeStatus("error", `Transaction failed or was rejected: ${escapeHtml(err?.message || err)}${txLink(err?.txHash)}`);
    } finally {
        setBusy(false);
        refreshStakeBalances();
    }
}

if ($id("stake")) {
    $id("stake-connect").addEventListener("click", connectWallet);
    $id("mini-connect").addEventListener("click", connectWallet);
    $id("stake-disconnect").addEventListener("click", disconnectWallet);
    document.querySelectorAll(".stake-tab").forEach((tab) => tab.addEventListener("click", () => setStakeMode(tab.dataset.mode)));
    $id("stake-max").addEventListener("click", () => {
        const max = maxAmount();
        const input = $id("stake-amount");
        input.value = Big(max).div(YOCTO).round(24, Big.roundDown).toFixed();
        input.dataset.max = "1";
    });
    $id("stake-amount").addEventListener("input", () => delete $id("stake-amount").dataset.max);
    $id("stake-amount").addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitStake();
    });
    $id("stake-submit").addEventListener("click", submitStake);
    $id("stake-withdraw").addEventListener("click", submitWithdraw);
    setStakeMode("stake");

    onWalletChange((accountId) => {
        $id("stake-disconnected").classList.toggle("hidden", !!accountId);
        $id("stake-connected").classList.toggle("hidden", !accountId);
        stakeStatus(null);
        Object.assign(stakeState, { available: "0", staked: "0", unstaked: "0", canWithdraw: false });
        updateMiniCard();
        if (accountId) {
            setAccountText("stake-account", accountId);
            setText("mini-staked", "…");
            setText("mini-sub", "Loading balance…");
            refreshStakeBalances();
        }
    });
}

restoreSession();

// ========================================
// Pools Table
// ========================================

function initPoolsTable() {
    const tableContainer = document.querySelector(".pools-table-container");
    tableContainer?.insertAdjacentHTML("afterbegin", '<div class="pools-loading" id="pools-loading"><div class="spinner"></div><span>Loading pools...</span></div>');

    window.pools_table = $("#view-pools-table").DataTable({
        destroy: true,
        pageLength: 50,
        deferRender: true,
        rowId: "account_id",
        order: [[5, "desc"]],
        columns: [
            {
                data: "account_id",
                class: "col-pool-name",
                render: (data, type, row) => type === "display"
                    ? `<a class="pool-link" data-pool-id="${escapeHtml(row.account_id)}" href="#">${escapeHtml(row.name || data)}</a>`
                    : data
            },
            { data: "info", class: "col-info", orderable: false, defaultContent: "" },
            { data: "numerator", class: "col-fees", render: (data, type) => type === "display" ? data + "%" : data },
            { data: "number_of_accounts", class: "col-delegators" },
            { data: "stake_display", class: "col-stake", orderData: 5 },
            { data: "stake", visible: false },
            {
                data: "status",
                class: "col-status",
                render: (data, type) => type === "display"
                    ? (data ? '<span class="status-active">Active</span>' : '<span class="status-inactive">Inactive</span>')
                    : data
            }
        ],
        ajax: {
            url: "https://near.zavodil.ru/pools_all.txt",
            dataSrc: function (json) {
                const data = json.data.map((pool) => ({
                    account_id: pool.account_id,
                    name: null,
                    info: null,
                    numerator: Math.round(pool.numerator),
                    number_of_accounts: pool.number_of_accounts,
                    stake: Number(pool.stake),
                    stake_display: Number(pool.stake).toLocaleString() + " NEAR",
                    status: pool.status
                }));

                data.sort((a, b) => b.stake - a.stake);

                document.querySelector("#pools-total-num")?.classList.remove("hidden");
                setText("pools-total-num-value", data.length);

                if (json.seat_price) {
                    document.querySelector("#seat-price")?.classList.remove("hidden");
                    setText("seat-price-value", Math.round(Number(json.seat_price)).toLocaleString());
                }

                $id("pools-loading")?.remove();
                return data;
            }
        },
        createdRow: function (row, data) {
            if (!data.status) row.classList.add("kicked-row");
        },
        initComplete: function () {
            loadPoolDetailsAsync();
        },
        footerCallback: function () {
            const api = this.api();
            const total = api.column(5).data().reduce((a, b) => a + b, 0);
            const delegators = api.column(3).data().reduce((a, b) => a + b, 0);
            $(api.column(4).footer()).html(total.toLocaleString() + " NEAR");
            $(api.column(3).footer()).html(delegators.toLocaleString());
        }
    });
}

async function fetchAllPoolDetails() {
    const limit = 100;
    const all = {};
    for (let from = 0; from < 5000; from += limit) {
        const page = await viewCall(POOL_DETAILS_ID, "get_all_fields", { from_index: from, limit });
        const keys = Object.keys(page || {});
        Object.assign(all, page);
        if (keys.length < limit) break;
    }
    return all;
}

function buildInfoHtml(details) {
    let html = "";
    if (details.twitter) {
        html += `<a href="https://twitter.com/${encodeURIComponent(details.twitter)}" target="_blank" rel="noopener" title="Twitter"><i class="fab fa-twitter"></i></a> `;
    }
    const url = safeUrl(details.url);
    if (url) {
        html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="Website"><i class="fas fa-globe"></i></a> `;
    }
    if (details.email) {
        html += `<a href="mailto:${escapeHtml(details.email)}" title="Email"><i class="fas fa-envelope"></i></a> `;
    }
    const discord = safeUrl(details.discord);
    if (discord) {
        html += `<a href="${escapeHtml(discord)}" target="_blank" rel="noopener" title="Discord"><i class="fab fa-discord"></i></a> `;
    }
    return html;
}

async function loadPoolDetailsAsync() {
    try {
        const details = await fetchAllPoolDetails();
        window.pools = details;

        const table = window.pools_table;
        if (!table) return;

        table.rows().every(function () {
            const data = this.data();
            const poolDetails = details[data.account_id];
            if (poolDetails) {
                if (poolDetails.name) data.name = poolDetails.name;
                const info = buildInfoHtml(poolDetails);
                if (info) data.info = info;
                this.data(data);
            }
        });

        table.draw(false);
    } catch (err) {
        console.error("Failed to load pool details:", err);
    }
}

$(document).on("click", ".pool-link", function (e) {
    e.preventDefault();
    showPoolModal($(this).data("pool-id"));
});

function showPoolModal(pool) {
    const poolFound = window.pools && Object.prototype.hasOwnProperty.call(window.pools, pool);

    if (poolFound) {
        const p = window.pools[pool];
        const url = safeUrl(p.url);
        const discord = safeUrl(p.discord);

        toggleModalRow("#pool-twitter", p.twitter, `<a href="https://twitter.com/${encodeURIComponent(p.twitter || "")}" target="_blank" rel="noopener">${escapeHtml(p.twitter)}</a>`);
        toggleModalRow("#pool-url", url, `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>`);
        toggleModalRow("#pool-email", p.email, `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>`);
        toggleModalRow("#pool-discord", discord, `<a href="${escapeHtml(discord)}" target="_blank" rel="noopener">Link</a>`);
        toggleModalRow("#pool-country", p.country, escapeHtml(p.country));
        toggleModalRow("#pool-city", p.city, escapeHtml(p.city));
        toggleModalRow("#pool-description", p.description, escapeHtml(p.description));
    }

    $id("block-explorer").innerHTML = `<a href="${EXPLORER}/address/${encodeURIComponent(pool)}" target="_blank" rel="noopener">${escapeHtml(pool)}</a>`;
    document.querySelector("#poolModal .modal-title").textContent = "Staking pool " + pool;
    $id("pool-not-found").classList.toggle("hidden", poolFound);
    $id("pool-found").classList.toggle("hidden", !poolFound);
    $id("poolModal").classList.remove("hidden");
}

function toggleModalRow(selector, value, html) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.toggle("hidden", !value);
    const valueEl = document.querySelector(selector + "-value");
    if (valueEl) valueEl.innerHTML = html;
}

// ========================================
// NFT
// ========================================

const ALL_NFTS = {
    "Early NEAR Delegator": 1,
    "Honored NEAR Delegator": 2,
    "Premium NEAR Delegator": 3,
    "Legendary NEAR Delegator": 4
};

function nftShow(id) {
    ["check-nft-error", "check-nft-staking-not-found", "check-nft-staking-found", "check-nft-exists"].forEach((x) =>
        $id(x).classList.toggle("hidden", x !== id));
}

$id("nft-account-id").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") await checkNearAccount();
});
$id("nft-check-button").addEventListener("click", checkNearAccount);
$id("nft-claim-button").addEventListener("click", (e) => {
    e.preventDefault();
    claimNFT();
});

onWalletChange((accountId) => {
    const input = $id("nft-account-id");
    if (accountId && input && !input.value && !input.disabled) input.value = accountId;
    updateNftClaimHint();
});

async function checkNearAccount() {
    const accountId = $id("nft-account-id").value.trim().toLowerCase();
    if (!accountId) return;

    const isLockup = $id("nft-check-lockup").checked;
    const stakingAccountId = isLockup ? accountToLockup("lockup.near", accountId) : accountId;

    $id("nft-check-loading").classList.remove("hidden");
    try {
        const amount = await viewCall(POOL_ID, "get_account_staked_balance", { account_id: stakingAccountId });
        await showStaking(amount, accountId);
    } catch (err) {
        console.log(err);
        nftShow("check-nft-error");
    } finally {
        $id("nft-check-loading").classList.add("hidden");
    }
}

async function showStaking(amount, accountId) {
    const stakedAmount = Big(amount);
    const [existingTokens, availableToken] = await Promise.all([
        viewCall(NFT_CONTRACT_ID, "nft_tokens_for_owner", { account_id: accountId }),
        viewCall(NFT_CONTRACT_ID, "get_available_token", { staked_amount: amount, account_id: accountId })
    ]);

    let allowToClaim = !!availableToken && Object.prototype.hasOwnProperty.call(availableToken, "title");
    if (allowToClaim) {
        let maxExistingLevel = 0;
        for (const token of existingTokens || []) {
            maxExistingLevel = Math.max(maxExistingLevel, ALL_NFTS[token.metadata.title] || 0);
        }
        allowToClaim = (ALL_NFTS[availableToken.title] || 0) > maxExistingLevel;
    }

    if (allowToClaim && stakedAmount.gt(0)) {
        $id("nft-account-id").setAttribute("disabled", "disabled");
        $id("nft-check-lockup").setAttribute("disabled", "disabled");
        $id("nft-check-button").setAttribute("disabled", "disabled");
        $id("nft-eligible-text").innerHTML =
            `Your stake qualifies for the <strong>${escapeHtml(availableToken.title)}</strong> badge.`;
        nftShow("check-nft-staking-found");
        updateNftClaimHint();
    } else if (existingTokens && existingTokens.length) {
        nftShow("check-nft-exists");
        $id("check-nft-exists-media").innerHTML = existingTokens
            .map((token) => `<figure class="nft-token"><img data-cid="${escapeHtml(token.metadata.media)}" data-gw="0" src="${IPFS_GATEWAYS[0]}${encodeURIComponent(token.metadata.media)}" alt="${escapeHtml(token.metadata.title)}"><figcaption>${escapeHtml(token.metadata.title)}</figcaption></figure>`)
            .join("");
        $id("check-nft-exists-media").querySelectorAll("img").forEach((img) => img.addEventListener("error", nextIpfsGateway));

        const token = existingTokens[existingTokens.length - 1];
        const text = `I just claimed ${token.metadata.title} NFT! Stake NEAR with Zavodil node #FutureIsNEAR @zacodil`;
        $id("my-nft-twit").innerHTML = `
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${SITE_URL}?nft`)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
                <i class="fab fa-twitter"></i> Share on Twitter
            </a>`;
    } else {
        nftShow("check-nft-staking-not-found");
    }
}

// Public IPFS gateways often rate-limit (429); fall back to the next one on error.
const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/"];

function nextIpfsGateway(e) {
    const img = e.currentTarget;
    const next = Number(img.dataset.gw) + 1;
    if (next >= IPFS_GATEWAYS.length) {
        img.removeEventListener("error", nextIpfsGateway);
        img.closest(".nft-token")?.classList.add("no-image");
        return;
    }
    img.dataset.gw = String(next);
    img.src = IPFS_GATEWAYS[next] + encodeURIComponent(img.dataset.cid);
}

function updateNftClaimHint() {
    const hint = $id("nft-claim-hint");
    const target = $id("nft-account-id")?.value.trim().toLowerCase();
    if (!hint || !target) return;
    hint.classList.remove("is-error");
    if (!walletState.accountId) {
        hint.innerHTML = `You'll be asked to connect <strong title="${escapeHtml(target)}">${escapeHtml(shortAccount(target))}</strong>`;
    } else if (walletState.accountId !== target) {
        hint.classList.add("is-error");
        hint.innerHTML = `Connected as <strong title="${escapeHtml(walletState.accountId)}">${escapeHtml(shortAccount(walletState.accountId))}</strong>. Reconnect as <strong title="${escapeHtml(target)}">${escapeHtml(shortAccount(target))}</strong> to claim.`;
    } else {
        hint.innerHTML = `<i class="fas fa-wallet"></i> Signing as <strong title="${escapeHtml(target)}">${escapeHtml(shortAccount(target))}</strong>`;
    }
}

async function claimNFT() {
    const accountId = $id("nft-account-id").value.trim().toLowerCase();
    const isLockup = $id("nft-check-lockup").checked;
    const hint = $id("nft-claim-hint");

    if (!walletState.accountId) {
        await connectWallet();
        if (!walletState.accountId) return;
    }
    if (walletState.accountId !== accountId) {
        updateNftClaimHint();
        return;
    }

    const params = { receiver_id: accountId };
    if (isLockup) params.is_lockup = true;

    try {
        hint.textContent = "Confirm the transaction in your wallet…";
        const outcome = await sendFunctionCall(NFT_CONTRACT_ID, "nft_mint", params, "10000000000000000000000", NFT_GAS);
        hint.innerHTML = `NFT claimed!${txLink(getTxHash(outcome))}`;
        $id("nft-account-id").removeAttribute("disabled");
        $id("nft-check-lockup").removeAttribute("disabled");
        $id("nft-check-button").removeAttribute("disabled");
        await checkNearAccount();
    } catch (err) {
        console.error(err);
        hint.classList.add("is-error");
        hint.innerHTML = `Claim failed or was rejected: ${escapeHtml(err?.message || err)}${txLink(err?.txHash)}`;
    }
}

// ========================================
// Init
// ========================================

route();
