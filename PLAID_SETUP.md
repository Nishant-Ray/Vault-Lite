# Deploy Plaid connections

The integration runs in Next.js on Vercel. Keep server credentials out of `NEXT_PUBLIC_` variables, source control, screenshots, and chats.

## 1. Add server variables to Vercel Production

The first three are the variables already added from Plaid's API Keys page:

| Variable | Value |
| --- | --- |
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Production secret (Trial uses Production) |
| `PLAID_ENV` | `production` |
| `PLAID_REDIRECT_URI` | `https://YOUR-PRODUCTION-DOMAIN/wallet` |
| `PLAID_TOKEN_ENCRYPTION_KEY` | A randomly generated 64-character hexadecimal key |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service-account JSON's `client_email` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service-account JSON's `private_key` |
| `CRON_SECRET` | A separately generated random secret |

Generate a random value locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it twice, once for the encryption key and once for the cron secret. Save the encryption key securely and keep it stable: changing it makes saved bank access tokens unreadable. The app does not generate or overwrite either key automatically.

In Firebase, open **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**. The downloaded JSON belongs to the same Firebase project as your existing app configuration. Copy its `client_email` into `FIREBASE_ADMIN_CLIENT_EMAIL`. Copy the complete `private_key` value, including BEGIN/END lines, into `FIREBASE_ADMIN_PRIVATE_KEY`; real newlines or literal `\n` both work. Do not include the surrounding JSON quotes. Keep the downloaded JSON outside the repository.

Existing `NEXT_PUBLIC_FIREBASE_*` variables and `NEXT_PUBLIC_ALLOWED_USER_UID` stay configured. Server routes verify Firebase ID tokens, including revocation checks, and restrict access to that UID. The Admin SDK can bypass Firestore rules, so its credentials must remain server-side.

## 2. Register the exact bank redirect

In **Plaid Dashboard → Build → API → Allowed redirect URIs → Configure**, add the exact value of `PLAID_REDIRECT_URI`, including `/wallet`. Use the stable Production domain, not a deployment-specific preview URL. Production redirects require HTTPS. Firebase Authentication should also list the production hostname in Authorized domains.

OAuth may return to Safari rather than the installed iPhone PWA. The redirect preserves the destination if Firebase asks you to log in, and can resume the authenticated owner's recent Link session from the server even when browser storage differs. Complete bank authorization in that browser, then reopen the home-screen app to see the synced data.

## 3. Publish the updated Firestore rules

Copy this repository's `firestore.rules` into **Firebase → Firestore Database → Rules**, verify the existing owner UID is correct, and click **Publish**. The rules allow personal expenses and bills without any account reference, deny new legacy accounts, and protect bank provenance and private tokens. Imported personal shares are edited through authenticated server routes. No additional indexes are required.

## 4. Commit, push, and deploy

Push the integration to the GitHub branch Vercel uses for Production, then deploy with the variables above. The included `vercel.json` schedules `/api/cron/plaid-sync` once daily at 10:00 UTC (6 a.m. Eastern during daylight saving time, 5 a.m. during standard time). Vercel supplies `CRON_SECRET` as the authorization header. Hobby cron timing can vary within the hour. Daily sync runs without the app being open.

Use **Vercel → Project → Settings → Cron Jobs** to check the job is enabled and review invocations. Failures are also shown per bank in Accounts. Firebase reads/writes and Vercel function usage count toward those services' own quotas independently of Plaid's trial allowance. Daily sync fills the review inbox; it does not add full bank charges to your personal spending automatically.

## 5. Connect from Accounts

1. Open the deployed app and log in.
2. Open **Accounts → Connect bank** and finish Plaid authorization. The existing `/wallet` URL is retained for bank redirects.
3. Select the bank/card sources you want Plaid to read. These only configure the import; no Wallet ledger accounts are created and no balances are stored.
4. Choose the first date to review transactions. If you already recorded them manually, you can match existing expenses or choose tomorrow to skip the past.
5. Click **Link selected sources**. Banks may need time to prepare transactions; use **Sync now** later if necessary.
6. Open **Spending → Transactions to review** and enter **My share** and **Add my share**, **Match expense** already logged, or **Ignore**. Match suggestions include personal expenses within seven days with the same positive/negative direction; amounts can differ. Only a deliberate match combines entries.

A $120 dinner with a $40 personal share contributes $40 to reports. Ignore the $80 Venmo/Zelle reimbursement; it is not a refund of your own spending. An outgoing Venmo/Zelle repayment for your own purchase can be added with your share and a spending category. Ignore credit-card statement payments, salary, and transfers between your own accounts. Those transfers default to a zero share. True refunds of personal spending use a negative share. All posted transactions wait for review; pending transactions are not imported. You can edit the personal share later, and future syncs preserve it.

## Upgrade existing data

After publishing the new rules and deploying this version, open **Settings → Back up & migrate existing data**. The app downloads `vault-lite-before-migration.json` (legacy accounts, expenses, and bills) and then removes legacy `accountId` fields from expenses/bills and obsolete private account mappings. The operation is repeatable and preserves amounts, recurring schedules, recorded bill links, encrypted bank tokens, sync cursors, ignored transactions, and selected bank sources. It does not delete any accounts or expenses. If interrupted, run it again.

Confirm the backup file was saved and check existing history. The migration preserves old amounts; change previously imported full charges to your actual share in Spending.

You may then delete only **`users/{yourUid}/accounts`** in Firestore, including its old balance records. Keep the user document, `expenses`, `bills`, `plaidItems` (including transactions), `plaidInstitutions`, `plaidLinkSessions`, and your Firebase Authentication user. Deleting bank collections could lose connections or import decisions and consume trial slots when re-linking. No environment variables or encryption keys need to change.

Use **Reconnect** for an existing bank that needs renewed authorization, rather than linking it again. This app allows one connection per institution. Removing a Production connection does not restore a Plaid trial slot; duplicates can consume slots even if the app immediately revokes them.

## Local and Preview environments

Use `.env.local` with `PLAID_ENV=sandbox`, the Sandbox secret, and `PLAID_REDIRECT_URI=http://localhost:3000/wallet`. Register that redirect in Plaid as well. Use a separate Firebase development project and owner UID to keep simulated bank data out of your real financial history. For Vercel Preview, configure separate Sandbox variables and an allowed redirect for the preview domain; leave Plaid variables unset if you do not need Preview bank linking. Do not switch environments for existing connections in the same Firebase project.

## Verification limits

TypeScript, production compilation, mock transaction flows, and responsive UI checks can run without real bank credentials. Complete a Sandbox connection and verify bank OAuth on your phone before relying on live sync. Never enter real bank credentials in a Sandbox flow. This integration reads financial data; it does not move money or pay bills.

References: [Plaid OAuth](https://plaid.com/docs/link/oauth/), [Transactions sync](https://plaid.com/docs/api/products/transactions/), [Firebase Admin setup](https://firebase.google.com/docs/admin/setup), [Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
