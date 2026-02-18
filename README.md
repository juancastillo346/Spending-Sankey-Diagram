## IncomeManager (Sandbox-first)

Local spending dashboard with a **Sankey chart** (account → category) powered by **Plaid Sandbox** data and stored locally in **SQLite**.

### What you get
- **Plaid Link** flow (Sandbox)
- **Transactions sync** via `/transactions/sync` into SQLite
- **Seed fake transactions** (creates realistic merchant descriptions for category variety)
- **Dashboard**: month picker, account filter, Sankey chart, totals, transaction table
- **Category overrides + rules** (simple “contains” rules)

### Setup
1. Create a Plaid developer account and get Sandbox keys.
2. Fill in `.env`:

```bash
PLAID_ENV="sandbox"
PLAID_CLIENT_ID="..."
PLAID_SECRET="..."
DATABASE_URL="file:./prisma/dev.db"
```

3. Install + migrate:

```bash
npm install
npm run db:migrate
```

### Run
Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

### How to use
1. Click **Connect (Plaid Link)** and link a Sandbox institution.
2. Click **Seed fake transactions** (Plaid only allows custom transactions within the last 14 days).
3. The Sankey should populate for the current month.
4. Use the dropdown in the transaction table to override categories; click **Save rule** to apply a contains-rule to similar transactions.

### Notes
- **Local-only**: access tokens + data are stored in local SQLite (`prisma/dev.db`). Treat this as sensitive data once you switch to real accounts later.
- **Spending filter**: the dashboard currently treats spending as `amount > 0` and excludes `TRANSFER_IN` / `TRANSFER_OUT`.

### Prisma Studio (optional)

```bash
npm run db:studio
```
