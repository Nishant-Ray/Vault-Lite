# Vault Lite

A single-user spending PWA adapted from [Nishant-Ray/Vault](https://github.com/Nishant-Ray/Vault). This repository is the Next.js project root. Firebase provides authentication and Firestore; optional Plaid imports run in authenticated Next.js routes on Vercel. There is no Rails, FastAPI, signup page, or AI service.

## Run locally

Use Node.js 20+ and npm.

```powershell
npm install
npm run dev
```

Open http://localhost:3000. Sign in with the allowed Firebase email/password user.

## Personal spending

Every expense's amount is **your personal share**, independent of which bank/card paid. A $120 dinner with a $40 share contributes $40 to spending. The $80 paid back by friends is ignored. If a friend covers your purchase and you repay them, record your own share once. True refunds of your own spending are negative expenses; reimbursements are not refunds.

Add, edit, and delete expenses without creating an account. Reports include monthly totals, prior-month comparisons, average expense, yearly charts, and category breakdowns. Filter by month, category, and description; CSV exports include your share and, when available, the original bank amount. Balances, safety buffers, account selectors, and spending-by-account reports have been removed.

Spending emphasizes the selected month, with a separate year filter and an All months option for a full year. Expense history defaults to oldest first unless an order has already been saved for that year. Choose alphabetical/newest order, or drag a handle with mouse or touch to save a custom order. Keyboard users can press Space, use the arrow keys, and press Space again to drop. Order is saved per year in `users/{yourUid}/spendingOrders/{year}` and restored across sessions/devices. Filtered reordering preserves hidden entries; CSV exports follow the visible order. Publish the updated Firestore rules to enable saving these preferences.

Bills support one-time, weekly, every-two-weeks, monthly, quarterly, and yearly schedules. Plan your share per payment, record it as a new expense, or link an existing expense without double counting. Removing a payment restores that scheduled occurrence; deleting a schedule keeps payment history. Monthly schedules clamp to the last day in shorter months without drifting. Bills do not initiate bank payments.

## Bank transaction inbox

**Accounts** contains only bank connection controls: linking, source selection, daily/manual sync, reconnect, and disconnect. **Spending** contains the transaction review inbox. The Accounts route remains `/wallet` so registered OAuth redirects continue to work.

Plaid source IDs remain private import configuration. Expenses and bills have **no `accountId`**. Original transaction IDs and encrypted connection IDs are retained as import provenance to prevent duplicate imports, not as payment-account relationships. No balances are saved or shown.

All posted bank transactions on or after your chosen start date enter **Transactions to review**. Pending transactions are skipped. Enter your share and category before adding an expense, match an existing personal expense, or ignore the transaction. Transfers/income default to zero so statement payments, reimbursements, and deposits are not silently counted as spending. Outgoing payments for your purchases can be categorized as spending; personal refunds use negative shares. Bank categories are suggestions.

Matching suggests manual expenses within seven days with the same positive/negative direction; the bank's full amount may differ from your logged share. Matching keeps the manual amount, description, date, category, and bill link. Future bank syncs update the original bank amount but never replace your confirmed share. Imported shares can be edited in Spending. Deleting a bank expense keeps it ignored on later syncs. If Plaid removes a confirmed transaction, an imported expense is removed; a matched manual expense is retained and detached from bank provenance.

Daily sync runs at 10:00 UTC via Vercel Cron, retrieving data Plaid has already collected. Hobby timing can vary within the hour. Stable IDs, saved cursors, pagination retries, and connection leases prevent duplicate/concurrent imports. AES-256-GCM protects private access tokens; none are returned to the browser. No webhook is required. USD checking, savings, money market, cash management, and credit-card sources are supported.

See [PLAID_SETUP.md](PLAID_SETUP.md) for deployment and migration. Existing bank connections and import decisions can be preserved; you do not need to re-link them.

## Existing Firebase data

Publish the updated `firestore.rules` and deploy this version, then use **Settings → Back up & migrate existing data**. It downloads the old ledger as JSON and removes obsolete account references while preserving spending amounts, bills, bank tokens, cursors, and decisions.

After verifying the backup and history, delete only `users/{yourUid}/accounts` from Firestore. Keep `expenses`, `bills`, `plaidItems` and its transactions, `plaidInstitutions`, `plaidLinkSessions`, the user document, and the Authentication user. Old expenses retain their old amounts until you edit them to your personal share.

## Data and PWA

```text
users/{yourUid}/expenses/{expenseId}
users/{yourUid}/bills/{billId}
users/{yourUid}/plaidItems/{itemId}                       # server only
users/{yourUid}/plaidItems/{itemId}/transactions/{id}     # server only
users/{yourUid}/plaidInstitutions/{institutionId}         # server only
users/{yourUid}/plaidLinkSessions/active                  # server only
```

Realtime Firestore subscriptions require no composite indexes. Rules and server routes restrict access to the allowed UID. Financial pages, API responses, and Firebase requests are not cached by the service worker; online access is required.

For production, run `npm run build` and `npm run start`, or deploy to Vercel. Install from Safari's Share → Add to Home Screen on iOS, or Chrome's Install app on Android. PWA installation requires HTTPS; the service worker registers in production only.

## Verification

```powershell
npm run typecheck
npm run build
```

Live bank authorization and Firestore writes require your configured project and published rules.

## Reused from Vault

Original source inspected at commit `b4cd7de7798378fcdbfe36a23626bee41bf7215b`. The Tailwind theme, base styling, card component, chart colors, and TypeScript configuration were adapted; the spending graph now uses Firestore expenses. Outfit and DM Sans preserve the original typography. Shared residences, AI, backend wrappers, JWT middleware, and signup were omitted.
