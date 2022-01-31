Counter example in Rust - Gitpod version
==================================================

This README is specific to Gitpod and this example. For local development, please see [README.md](README.md).

## Description

In Gitpod, the counter will start automatically. Please look in the terminal for a link to follow.

This contract implements simple counter backed by storage on blockchain.
Contract in `contract/src/lib.rs` provides methods to increment / decrement counter and get it's current value or reset.

Plus and minus buttons increase and decrease value correspondingly. When button L is toggled, a little light turns on, just for fun. RS button is for reset. LE and RE buttons to let the robot wink at you.

## To Test

```
cd contract
cargo test -- --nocapture
```

## To Explore

- `contract/src/lib.rs` for the contract code
- `src/index.html` for the front-end HTML
- `src/main.js` for the JavaScript front-end code and how to integrate contracts
- `src/test.js` for the JS tests for the contract


## Data collection

By using Gitpod in this project, you agree to opt-in to basic, anonymous analytics. No personal information is transmitted. Instead, these usage statistics aid in discovering potential bugs and user flow information.
