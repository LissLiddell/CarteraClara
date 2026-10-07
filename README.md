# Cartera Clara — Operational Collections Demo

Cartera Clara is an original collections workflow demo for fictional companies. It shows a concrete cycle: **a supervisor assigns an account → an agent records a contact and its outcome → if the customer makes a commitment, the agent records an amount and an optional date → finance confirms a payment → the balance and history update**. The sample portfolio contains three clean accounts and a fourth case with an overdue promise for practicing follow-up.

It contains no code, data, screens, or rules from an employer. It does not send messages or process real payments, and it is not a production-ready collections system.

## Run locally with SQL Server

Requirements: Node.js 20+, the .NET 10 SDK, and Docker Desktop with its engine running. The launcher recognizes a standard `dotnet` installation; in this workspace, it can also use the local SDK at `../.tools/dotnet`.

From this directory in PowerShell:

```powershell
npm run db:setup
npm run db:up
npm run dev
```

Open `http://127.0.0.1:4173`. The first run applies the migration and seeds **three clean fictional accounts and one overdue case** in SQL Server. A local password is generated in `.env` and must not be committed to Git. The **Reiniciar datos de ejemplo** button clears transactions from this local database and restores the four cases; it is available only in development mode. `npm run db:down` stops the container without deleting its volume.

The development connection uses `Encrypt=False` **only** on the local `127.0.0.1` port. Do not reuse that setting for a remote server. If you set `ConnectionStrings__CarteraClara`, the launcher respects your own encryption configuration.

Data from the earlier `localStorage` version is neither imported nor deleted: this version simply stops reading it. You can start fresh without affecting the history still stored in your browser.

## Try an overdue promise without changing the clock

When the customer specifies a commitment date, that date must be in the future. To see a **dated** promise become overdue in the demo, leave it unpaid or partially paid, select a day after its due date under **Simular fecha de consulta**, and inspect the account. It will show **Promesa vencida** and the amount still outstanding. A promise is not overdue on its due date, and a fully paid promise never becomes overdue. An **undated** amount commitment can receive payments but does not become overdue automatically.

The selected date is a **read-only preview** for that browser tab. The server calculates how the overdue status would appear, but it does not change its clock, the commitment date, balances, database, or activity log. Forms are disabled while the preview is active; **Volver a hoy** restores normal operation. When a promise actually becomes overdue, the agent can record another follow-up contact, and finance can still apply payments to that promise.

To try **scheduling a new follow-up date** right away, click **Volver a hoy** if you were previewing another date, select **CC-107 · Comercial Arce**, and switch to **Agente · Lía**. This case already has an overdue historical promise. Choose a future date under **Agendar próxima gestión**. The original promised payment date does not change: the new date is only for the agent's next follow-up, is recorded in the activity log, and can be rescheduled. If finance pays the promise in full, the pending follow-up closes. In local development, **Reiniciar datos de ejemplo** restores all four cases.

To verify the original business rules:

```powershell
npm test
```

With the API running, `npm run test:e2e` exercises a real workflow against SQL Server **only if the three original accounts remain clean and CC-107 still has only its initial history**. It leaves the resulting transactions in place so you can inspect them in the UI. Use **Reiniciar datos de ejemplo** before running it again.

## Demo roles

- **Supervisor:** assigns an account to Lía or Marco before contact begins.
- **Assigned agent:** classifies the outcome of each completed contact. If a payment amount is agreed, the agent records it with the contact, with or without a date. If a date is agreed later, it is added to the same commitment. The agent can also close a contact as **requiere seguimiento** (follow-up needed) or **sin acuerdo** (no agreement), without inventing a promise.
- **Overdue promise:** calculated when the selected date is after the due date and some of the committed amount remains unpaid. It is a derived status, not an automatic change to the stored agreement.
- **Finance:** sees only assigned accounts. It confirms payments for an identified account using a unique reference; payments reduce the balance and may fulfill a promise.

The role selector exists only to explore the demo. It is not real authentication: anyone with access can select a role. The API validates the business rules again, in addition to hiding unavailable controls in the UI.

## Public demo limits

Outside development mode, the API allows at most 30 requests per minute per IP address observed by the server and 1,000 requests to `/api` per day across all visitors. Once a limit is reached, it returns HTTP 429 without reading or changing SQL data. Static files and `/api/health` do not consume the daily API counter. The health endpoint confirms only that the process responds, **not** that the database is available. These limits do not interfere with local development tests.

The counters live in memory: they reset when the application restarts and are neither an absolute defense against abuse nor a billing cap. Behind a proxy, several visitors may also share the IP address observed by the application. The demo is open and shared, so anyone can change its **fictional accounts**; never enter real information. To avoid cloud charges, the deployment should use only a free application plan and the Azure SQL free offer with **Auto-pause the database until next month** selected when its allowance is exhausted. If either option is not clearly shown as free, stop and review the configuration before confirming. An Azure budget sends alerts; it does not stop usage.

## Persistence and out-of-scope features

The ASP.NET Core API stores accounts, contacts, promises, payments, and activity history in related tables. The initial migration is in `api/Migrations`. Each operation updates the account and its activity history in one transaction; SQL Server prevents duplicate payment references, and its `rowversion` detects concurrent changes to the same account. Monetary amounts are stored as integer cents.

Real authentication, real payments, customer communications, late-payment interest, legal contact rules, and automated routing are out of scope. Therefore, **this is not a production-ready collections system**. The public demo uses a free App Service plan and the Azure SQL free offer; changing those options may incur charges.

The database choice and alternatives are explained in [DATABASE_DECISION.md](./DATABASE_DECISION.md) (currently in Spanish).

## Project deployment

This repository contains the demo and its local setup instructions. The local SQL Server password lives in `.env`, which is excluded from Git. The public deployment configures `ConnectionStrings__CarteraClara` in App Service and uses its managed identity to access Azure SQL without a password; GitHub Actions deploys through a separate identity using OIDC. Do not publish credentials or expose the local Docker port. The demo's role selector **is not authentication**, so present the site as an interactive sample with fictional data, never as a real collections system.
