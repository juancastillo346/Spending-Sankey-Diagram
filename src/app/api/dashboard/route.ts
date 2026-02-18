import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  account: z.string().optional(), // plaidAccountId or "all"
});

const EXCLUDED_PFC_PRIMARY = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);

function monthRange(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function currentMonthYYYYMM(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse({
      month: url.searchParams.get("month") ?? undefined,
      account: url.searchParams.get("account") ?? undefined,
    });

    const month = parsed.month ?? currentMonthYYYYMM();
    const { start, end } = monthRange(month);

    const accounts = await db.account.findMany({
      orderBy: { name: "asc" },
      select: {
        plaidAccountId: true,
        name: true,
        officialName: true,
        mask: true,
        type: true,
        subtype: true,
      },
    });

    const accountFilter =
      parsed.account && parsed.account !== "all"
        ? { plaidAccountId: parsed.account }
        : undefined;

    const transactions = await db.transaction.findMany({
      where: {
        pending: false,
        amount: { gt: 0 },
        date: { gte: start, lt: end },
        personalFinanceCategoryPrimary: {
          notIn: Array.from(EXCLUDED_PFC_PRIMARY),
        },
        account: accountFilter,
      },
      orderBy: { date: "desc" },
      take: 500,
      select: {
        plaidTransactionId: true,
        date: true,
        amount: true,
        name: true,
        merchantName: true,
        originalDescription: true,
        personalFinanceCategoryPrimary: true,
        personalFinanceCategoryDetailed: true,
        account: {
          select: { plaidAccountId: true, name: true, mask: true },
        },
        override: { select: { category: true } },
      },
    });

    const byCategory = new Map<string, number>();
    const byAccount = new Map<string, number>();
    const linkSums = new Map<string, number>(); // `${source}__${target}` -> value

    function accountLabel(a: { name: string; mask: string | null }): string {
      return a.mask ? `${a.name} •${a.mask}` : a.name;
    }

    for (const t of transactions) {
      const source = accountLabel(t.account);
      const category =
        t.override?.category ??
        t.personalFinanceCategoryPrimary ??
        "UNCATEGORIZED";
      const amount = Number(t.amount);

      byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
      byAccount.set(source, (byAccount.get(source) ?? 0) + amount);

      const key = `${source}__${category}`;
      linkSums.set(key, (linkSums.get(key) ?? 0) + amount);
    }

    const sources = Array.from(byAccount.keys()).sort();
    const categories = Array.from(byCategory.keys()).sort();
    const nodes = [...sources, ...categories].map((id) => ({ id }));

    const links = Array.from(linkSums.entries()).map(([key, value]) => {
      const [source, target] = key.split("__");
      return { source, target, value: Math.round(value * 100) / 100 };
    });

    const totalsByCategory = Array.from(byCategory.entries())
      .map(([category, total]) => ({
        category,
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    const totalsByAccount = Array.from(byAccount.entries())
      .map(([account, total]) => ({
        account,
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    const totalSpending = totalsByCategory.reduce((sum, x) => sum + x.total, 0);

    return NextResponse.json({
      month,
      accounts,
      sankey: { nodes, links },
      totals: {
        spending: Math.round(totalSpending * 100) / 100,
        byCategory: totalsByCategory,
        byAccount: totalsByAccount,
      },
      transactions: transactions.map((t) => ({
        id: t.plaidTransactionId,
        date: t.date.toISOString().slice(0, 10),
        amount: Number(t.amount),
        merchant: t.merchantName ?? t.name,
        accountId: t.account.plaidAccountId,
        accountName: accountLabel(t.account),
        plaidCategory: t.personalFinanceCategoryPrimary,
        overrideCategory: t.override?.category ?? null,
        category:
          t.override?.category ??
          t.personalFinanceCategoryPrimary ??
          "UNCATEGORIZED",
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

