# BYB Commercial Validation Site

Public validation surface for a one-time, AI-assisted and Founder-reviewed
decision report for AI solo founders.

## Current boundary

- Price: USD 19, one-time.
- Scope: one product and one concrete decision.
- Delivery: within 48 hours after payment and complete usable inputs.
- Clarification: one round by email.
- Status: validation-only. Production checkout and customer input are disabled.
- The public Decision Card is a fictional sample and contains no customer data.

## Published decision

The footer shows the current BYB self decision: `WATCH · confidence 0.55`
(`dec_byb_self_001`, score 61.2, rule version 0.2.0). 0.55 is the value after
the v0.2 source-dominance cap is applied; the uncapped v0.1 record (0.66) is
historical and must not be displayed. Keep the footer in sync with
`cases/byb-self/decision-v0.2.json` in the internal BYB OS repository.

The internal BYB OS research repository, evidence corpus, reviews, outreach
records, candidate lists, and commercial scorecards are intentionally excluded.

## Local verification

Requires Node.js 18+ and Python 3.

```bash
npm install
npm run verify
```

`@waffo/pancake-ts` is pinned to `0.16.1`. The checkout endpoint only accepts
the reviewed Waffo Test Mode identifiers. Never commit a Waffo private key.

## Environment variables

Copy `.env.example` to a local untracked file or configure these values in the
hosting provider. `WAFFO_PRIVATE_KEY` (or its base64 form) is server-only.

The first deployment is a Preview validation build. Production payment remains
disabled until Waffo review, Test Mode end-to-end verification, and explicit
Founder approval are complete.

## Test Mode webhook

Register this HTTPS endpoint in Waffo Test Mode:

```text
https://<your-vercel-host>/api/waffo-webhook
```

It verifies `X-Waffo-Signature` with the SDK, requires `mode=test`, and accepts
events only for the reviewed Store ID. It logs non-sensitive event identifiers
for manual Founder review; it does not automatically fulfil an order or treat a
test event as revenue.
