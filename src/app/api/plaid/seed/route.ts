import { NextResponse } from "next/server";
import type { AccountBase, RemovedTransaction, Transaction } from "plaid";
import { PersonalFinanceCategoryVersion } from "plaid";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPlaidClient } from "@/lib/plaid";

const BodySchema = z
  .object({
    itemId: z.number().int().positive().optional(),
    count: z.number().int().min(1).max(100).optional(),
  })
  .optional();

function formatYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateToStableDateTime(date: string | null | undefined): Date | null {
  if (!date) return null;
  return new Date(`${date}T12:00:00.000Z`);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randAmount(min: number, max: number): number {
  const cents = randInt(min * 100, max * 100);
  return Math.round(cents) / 100;
}

const SEED_MERCHANTS: Array<{ description: string; min: number; max: number }> =
  [
    { description: "STARBUCKS", min: 4, max: 15 },
    { description: "WHOLE FOODS", min: 20, max: 120 },
    { description: "UBER TRIP", min: 8, max: 45 },
    { description: "SHELL OIL", min: 25, max: 80 },
    { description: "NETFLIX.COM", min: 9, max: 25 },
    { description: "SPOTIFY", min: 10, max: 15 },
    { description: "AMAZON MARKETPLACE", min: 10, max: 220 },
    { description: "TARGET", min: 15, max: 180 },
    { description: "DELTA AIR LINES", min: 120, max: 600 },
    { description: "CHIPOTLE", min: 9, max: 25 },
    { description: "CVS PHARMACY", min: 8, max: 60 },
    { description: "APPLE.COM/BILL", min: 1, max: 35 },
  ];

async function syncItem(plaid: ReturnType<typeof getPlaidClient>, item: { id: number; accessToken: string; cursor: string | null }) {
  let cursor: string | undefined = item.cursor ?? undefined;
  let hasMore = true;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];
  let latestAccounts: AccountBase[] = [];

  while (hasMore) {
    const response = await plaid.transactionsSync({
      access_token: item.accessToken,
      cursor,
      options: {
        include_original_description: true,
        personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
      },
    });
    const data = response.data;

    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    latestAccounts = (data.accounts as AccountBase[]) ?? latestAccounts;

    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  const accountIdMap = new Map<string, number>();
  for (const a of latestAccounts) {
    const acc = await db.account.upsert({
      where: { plaidAccountId: a.account_id },
      update: {
        itemId: item.id,
        name: a.name,
        officialName: a.official_name ?? null,
        type: a.type,
        subtype: a.subtype ?? null,
        mask: a.mask ?? null,
      },
      create: {
        plaidAccountId: a.account_id,
        itemId: item.id,
        name: a.name,
        officialName: a.official_name ?? null,
        type: a.type,
        subtype: a.subtype ?? null,
        mask: a.mask ?? null,
      },
      select: { id: true, plaidAccountId: true },
    });
    accountIdMap.set(acc.plaidAccountId, acc.id);
  }

  const removedIds = removed
    .map((r) => r.transaction_id as string | undefined)
    .filter((x): x is string => Boolean(x));
  if (removedIds.length) {
    await db.transaction.deleteMany({
      where: { plaidTransactionId: { in: removedIds } },
    });
  }

  const upserts = [...added, ...modified];
  for (const t of upserts) {
    const internalAccountId = accountIdMap.get(t.account_id);
    if (!internalAccountId) continue;
    const pfc = t.personal_finance_category ?? null;

    await db.transaction.upsert({
      where: { plaidTransactionId: t.transaction_id },
      update: {
        accountId: internalAccountId,
        date: dateToStableDateTime(t.date) ?? new Date(),
        authorizedDate: dateToStableDateTime(t.authorized_date),
        amount: t.amount,
        isoCurrencyCode: t.iso_currency_code ?? null,
        name: t.name,
        merchantName: t.merchant_name ?? null,
        originalDescription: t.original_description ?? null,
        pending: Boolean(t.pending),
        pendingTransactionId: t.pending_transaction_id ?? null,
        personalFinanceCategoryPrimary: pfc?.primary ?? null,
        personalFinanceCategoryDetailed: pfc?.detailed ?? null,
      },
      create: {
        plaidTransactionId: t.transaction_id,
        accountId: internalAccountId,
        date: dateToStableDateTime(t.date) ?? new Date(),
        authorizedDate: dateToStableDateTime(t.authorized_date),
        amount: t.amount,
        isoCurrencyCode: t.iso_currency_code ?? null,
        name: t.name,
        merchantName: t.merchant_name ?? null,
        originalDescription: t.original_description ?? null,
        pending: Boolean(t.pending),
        pendingTransactionId: t.pending_transaction_id ?? null,
        personalFinanceCategoryPrimary: pfc?.primary ?? null,
        personalFinanceCategoryDetailed: pfc?.detailed ?? null,
      },
      select: { id: true },
    });
  }

  await db.item.update({
    where: { id: item.id },
    data: { cursor: cursor ?? null },
  });

  return { added: added.length, modified: modified.length, removed: removed.length };
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json().catch(() => ({})));
    const count = body?.count ?? 30;
    const plaid = getPlaidClient();

    const items = await db.item.findMany({
      where: body?.itemId ? { id: body.itemId } : undefined,
      select: { id: true, accessToken: true, cursor: true },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No linked Items found. Connect an account first." },
        { status: 400 },
      );
    }

    const seeded: Array<{ itemId: number; created: number }> = [];
    const synced: Array<{ itemId: number; added: number; modified: number; removed: number }> =
      [];

    for (const item of items) {
      // NOTE: Plaid only allows custom sandbox transactions dated today..14 days ago.
      const now = new Date();
      const transactions = Array.from({ length: count }).map(() => {
        const merchant = SEED_MERCHANTS[randInt(0, SEED_MERCHANTS.length - 1)];
        const daysAgo = randInt(0, 13);
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - daysAgo);
        const date = formatYYYYMMDD(d);

        return {
          date_transacted: date,
          date_posted: date,
          amount: randAmount(merchant.min, merchant.max),
          description: merchant.description,
          iso_currency_code: "USD",
        };
      });

      await plaid.sandboxTransactionsCreate({
        access_token: item.accessToken,
        transactions,
      });

      seeded.push({ itemId: item.id, created: transactions.length });
      const syncResult = await syncItem(plaid, item);
      synced.push({ itemId: item.id, ...syncResult });
    }

    return NextResponse.json({ seeded, synced });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

