import { NextResponse } from "next/server";
import type { AccountBase, RemovedTransaction, Transaction } from "plaid";
import { PersonalFinanceCategoryVersion } from "plaid";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPlaidClient } from "@/lib/plaid";

const BodySchema = z
  .object({
    itemId: z.number().int().positive().optional(),
  })
  .optional();

function dateToStableDateTime(date: string | null | undefined): Date | null {
  if (!date) return null;
  // Use midday UTC to avoid timezone shifting the YYYY-MM-DD date.
  return new Date(`${date}T12:00:00.000Z`);
}

export async function POST(req: Request) {
  try {
    const body = BodySchema ? BodySchema.parse(await req.json().catch(() => ({}))) : {};
    const plaid = getPlaidClient();

    const items = await db.item.findMany({
      where: body?.itemId ? { id: body.itemId } : undefined,
      select: { id: true, accessToken: true, cursor: true },
    });

    const results: Array<{
      itemId: number;
      added: number;
      modified: number;
      removed: number;
      accounts: number;
      cursor: string;
    }> = [];

    for (const item of items) {
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

      // Upsert accounts and build plaidAccountId -> internal id map
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

      results.push({
        itemId: item.id,
        added: added.length,
        modified: modified.length,
        removed: removed.length,
        accounts: latestAccounts.length,
        cursor: cursor ?? "",
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

