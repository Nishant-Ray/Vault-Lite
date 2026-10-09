# Vault Lite

A single-user personal finance PWA, adapted from [Nishant-Ray/Vault](https://github.com/Nishant-Ray/Vault). This repository is the Next.js project root. The browser uses Firebase Authentication and Cloud Firestore. Optional Plaid connections use authenticated Next.js server routes on Vercel; no separate Rails or FastAPI service is required.

## Run locally

Use Node.js 20+ and npm.

```powershell
npm install
npm run dev
```

Open http://localhost:3000. The app uses email/password login for a single user, with no signup route.

## Features

- Add, edit, and delete expenses, with payment account, category, description, and date.
- Monthly totals, average expense, prior-month comparison, yearly chart, category percentages, and account/card breakdowns. Filter by month, card/bank account, category, and description; export filtered spending to CSV.
- Bank and credit-card accounts with nicknames and optional last four digits. Bank balances decrease with expenses; card amounts owed increase. Set a per-bank safety buffer for low-balance alerts.
- One-time and recurring bills with weekly, every-two-weeks, monthly, quarterly, and yearly schedules. Set the amount per payment and first scheduled date, see the next unpaid date, and filter by account or payment history. Record the actual amount, date, and paying account; each payment becomes an expense through a Firestore transaction that prevents duplicates for the same occurrence. Deleting a payment makes that occurrence unpaid again. Deleting a schedule keeps recorded expenses.
- JSON data export, logout, responsive sidebar on desktop, bottom navigation on phones, touch-friendly forms, and keyboard-accessible dialogs.
- Installable PWA with manifest, PNG icons, Apple home-screen metadata, service worker, and an offline fallback.

## Balance tracking

For **manual accounts**, an account's saved balance is its balance at the **start of the selected opening date**. Expenses dated on or after that date through today adjust it; older spending remains in reports. Editing or deleting expenses changes the computed balance. The Dashboard cash/debt cards cover all accounts; its spending filters affect spending charts, summaries, and bills.

For **Plaid-connected accounts**, Wallet and Dashboard use the latest bank-reported balance, without applying local expenses again. Bank balances can be delayed. Deposits, transfers, and statement payments are reflected by the bank rather than local expense arithmetic. Bank accounts use available balance when supplied, otherwise current balance; credit cards use current amount owed. USD checking, savings, money market, cash management, and credit-card accounts are supported. Disconnecting revokes bank access and resumes manual tracking from the last reported balance.

Reconcile in Wallet after deposits, refunds, transfers, or credit-card payments. When editing an existing account, enter the **current balance** shown by your bank or card. The app resets the balance date to today and automatically accounts for today's already-logged expenses so they are not counted again. Your expense history remains intact. Credit-card statement payments are transfers rather than new spending: reconcile bank and card balances instead of recording another expense. Account type is fixed after creation; accounts with history cannot be deleted in the UI.

Amounts are stored as integer cents; currency is USD. Expenses cannot be future-dated in the entry form. Recurring bills are schedules: they do not change balances until you record a payment, and they do not initiate payments with a bank.

## Bank sync

Wallet includes Connect bank, account matching, an import start date, Sync now, Reconnect, Disconnect, and a review list for possible duplicate purchases. Match bank accounts to existing Wallet accounts to preserve your history. Transactions before the selected date and pending transactions are excluded. Posted purchases are imported automatically; refunds in purchase categories reduce spending. Deposits, transfers, card statement payments, loan payments, and unclassified transactions are excluded from expense reports. Verify classifications against your bank statements; add an expense manually if Plaid misclassifies or omits a purchase.

Possible duplicates have the same account and amount within three days. Review them by matching an existing expense, importing separately, or ignoring. Matches preserve manual descriptions, categories, and bill links. Deleting a bank-imported expense ignores it on future syncs without changing the bank balance. Imported expenses allow description/category edits; amount, date, and account remain supplied by the bank. In Record payment, select an already imported bank purchase to mark a bill paid without creating another expense. Importing alone does not mark a scheduled bill paid automatically.

Daily sync runs at 10:00 UTC via Vercel Cron; Hobby timing can vary within that hour. Sync retrieves the latest data Plaid has collected rather than requesting an immediate refresh from the bank. No Plaid webhook is required. Stable transaction IDs, saved cursors, pagination retries, and per-connection leases prevent repeated or concurrent syncs from duplicating purchases. Private access tokens are encrypted with AES-256-GCM and never returned to the browser.

Deployment variables and the remaining console steps are in [PLAID_SETUP.md](PLAID_SETUP.md). Manual tracking remains available without Plaid credentials.

The first payment date anchors the recurring schedule. Monthly and quarterly bills keep the original day, using the last day of shorter months. A yearly bill starting February 29 falls on February 28 in non-leap years and February 29 in leap years. Start a schedule at your next unpaid payment so you do not need to import old payments. Existing bills remain one-time bills until you edit their frequency. Monthly commitment totals are estimates: weekly bills use 52 payments per year and every-two-weeks bills use 26.

## Data layout

```text
users/{yourUid}/accounts/{accountId}
users/{yourUid}/expenses/{expenseId}
users/{yourUid}/bills/{billId}
users/{yourUid}/plaidItems/{itemId}                       # server only
users/{yourUid}/plaidItems/{itemId}/transactions/{id}     # server only
users/{yourUid}/plaidInstitutions/{institutionId}         # server only
users/{yourUid}/plaidLinkSessions/active                  # server only
```

The app uses realtime Firestore subscriptions with no composite indexes required. Firebase Auth restores the browser session; Firestore rules secure data even if client route guards are bypassed. No persistent Firestore offline cache is enabled. The service worker only caches public icons and the offline page; financial pages and Firebase responses are not cached by it. Online connectivity is required to load and change data.

## Production and PWA

```powershell
npm run build
npm run start
```

Deploy as a standard Next.js app (for example on Vercel). Use HTTPS for installation on phones. On iOS, open in Safari → Share → Add to Home Screen. On Android, use Chrome → Install app / Add to Home screen. Desktop Chrome and Edge offer an install button. The service worker registers only in production; `npm run dev` is for development. Actual device installation should be checked on your deployed HTTPS domain.

## Verification

```powershell
npm run typecheck
npm run build
```

Live login and Firestore writes require your Firebase project and deployed rules.

## Reused from Vault

Source inspected at commit `b4cd7de7798378fcdbfe36a23626bee41bf7215b`. The original Tailwind theme, base global styles, card component, chart colors, and TypeScript configuration were copied. The Chart.js spending graph was adapted to Firebase data. Dashboard, wallet, expense, and bill workflows retain the original structure and have been rebuilt around the Firebase schema, grouped account selectors, and responsive layouts. Tailwind was upgraded to v4 while retaining the original theme. Shared residences, AI, backend API wrappers, JWT middleware, and signup were omitted.
