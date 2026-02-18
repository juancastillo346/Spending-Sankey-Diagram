"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

import { SankeyClient, type SankeyData } from "@/components/SankeyClient";
import { PieClient } from "@/components/PieClient";
import { DEFAULT_CATEGORIES, formatCategoryLabel, getCategoryColorMap } from "@/lib/categories";

type DashboardResponse = {
  month: string;
  accounts: Array<{
    plaidAccountId: string;
    name: string;
    officialName: string | null;
    mask: string | null;
    type: string;
    subtype: string | null;
  }>;
  sankey: SankeyData;
  totals: {
    spending: number;
    byCategory: Array<{ category: string; total: number }>;
    byAccount: Array<{ account: string; total: number }>;
  };
  transactions: Array<{
    id: string;
    date: string;
    amount: number;
    merchant: string;
    accountId: string;
    accountName: string;
    plaidCategory: string | null;
    overrideCategory: string | null;
    category: string;
  }>;
};

function currentMonthYYYYMM(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getYearOptions(): number[] {
  const currentYear = new Date().getUTCFullYear();
  return Array.from({ length: 5 }, (_, i) => currentYear - i);
}

async function postJson(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `Request failed: ${res.status}`);
  }
  return json;
}

export default function Home() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getUTCMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<number>(now.getUTCFullYear());
  const month = `${selectedYear}-${selectedMonth.padStart(2, "0")}`;
  const [account, setAccount] = useState<string>("all");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"sankey" | "pie">("sankey");
  const [pieGroup, setPieGroup] = useState<"category" | "account">("category");

  const pieSlices = useMemo(() => {
    if (chartView !== "pie") return [] as { id: string; label: string; value: number; color?: string }[];
    if (pieGroup === "category") {
      const byCat = data?.totals.byCategory ?? [];
      const labels = byCat.map((b) => formatCategoryLabel(b.category));
      const colorMap = getCategoryColorMap(labels);
      return byCat.map((b) => {
        const label = formatCategoryLabel(b.category);
        return { id: b.category, label, value: b.total, color: colorMap.get(label) ?? "#94a3b8" };
      });
    } else {
      const byAcc = data?.totals.byAccount ?? [];
      const labels = byAcc.map((a) => a.account);
      const colorMap = getCategoryColorMap(labels);
      return byAcc.map((a) => ({
        id: a.account,
        label: a.account,
        value: a.total,
        color: colorMap.get(a.account) ?? "#94a3b8",
      }));
    }
  }, [data, chartView, pieGroup]);

  const refresh = useMemo(() => {
    return async (opts?: { month?: string; account?: string }) => {
      const m = opts?.month ?? month;
      const a = opts?.account ?? account;
      const res = await fetch(`/api/dashboard?month=${m}&account=${a}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DashboardResponse | { error: string };
      if (!res.ok) {
        const msg = "error" in json ? json.error : "Failed to load";
        throw new Error(msg);
      }
      setData(json as DashboardResponse);
    };
  }, [month, account]);

  useEffect(() => {
    (async () => {
      try {
        const tok = await postJson("/api/plaid/link-token");
        setLinkToken(tok.link_token);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed to init Plaid Link");
      }
    })();
  }, []);

  useEffect(() => {
    refresh().catch((e) => setStatus(e instanceof Error ? e.message : "Error"));
  }, [month, account, refresh]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token) => {
      setBusy(true);
      setStatus("Exchanging token…");
      try {
        await postJson("/api/plaid/exchange", { public_token });
        setStatus("Syncing transactions…");
        await postJson("/api/plaid/sync");
        setStatus(null);
        await refresh();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Link failed");
      } finally {
        setBusy(false);
      }
    },
  });

  async function syncNow() {
    setBusy(true);
    setStatus("Syncing transactions…");
    try {
      await postJson("/api/plaid/sync");
      setStatus(null);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function seedNow() {
    setBusy(true);
    setStatus("Seeding fake transactions…");
    try {
      await postJson("/api/plaid/seed", { count: 40 });
      setStatus(null);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  async function setOverride(transactionId: string, next: string) {
    setBusy(true);
    try {
      await postJson("/api/overrides", {
        transactionId,
        category: next === "__plaid__" ? null : next,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveRule(pattern: string, category: string) {
    setBusy(true);
    try {
      await postJson("/api/rules", {
        matchType: "contains",
        pattern,
        category,
        applyNow: true,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const accounts = data?.accounts ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Spending Sankey
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Plaid Sandbox → local SQLite. Seed transactions to populate the
              chart.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              onClick={() => open()}
              disabled={!ready || busy}
            >
              Connect (Plaid Link)
            </button>
            <button
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              onClick={syncNow}
              disabled={busy}
            >
              Sync
            </button>
            <button
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              onClick={seedNow}
              disabled={busy}
            >
              Seed fake transactions
            </button>
            <div className="ml-2 inline-flex rounded-md shadow-sm" role="tablist" aria-label="Chart view">
              <button
                className={`rounded-l-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 ${chartView === "sankey" ? "ring-1 ring-zinc-300" : ""}`}
                onClick={() => setChartView("sankey")}
                aria-pressed={chartView === "sankey"}
                disabled={busy}
              >
                Sankey
              </button>
              <button
                className={`-ml-px rounded-r-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 ${chartView === "pie" ? "ring-1 ring-zinc-300" : ""}`}
                onClick={() => setChartView("pie")}
                aria-pressed={chartView === "pie"}
                disabled={busy}
              >
                Pie
              </button>
            </div>
            {chartView === "pie" ? (
              <select
                value={pieGroup}
                onChange={(e) => setPieGroup(e.target.value as "category" | "account")}
                className="ml-3 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="category">Group by category</option>
                <option value="account">Group by account</option>
              </select>
            ) : null}
          </div>
        </div>

        {status ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {status}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:w-[100px]"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i} value={String(i + 1)}>
                      {name}
                    </option>
                  ))}
                </select>
                <label className="text-sm text-zinc-600 dark:text-zinc-400">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:w-[100px]"
                >
                  {getYearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">
                  Account
                </label>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:w-[320px]"
                >
                  <option value="all">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.plaidAccountId} value={a.plaidAccountId}>
                      {a.name}
                      {a.mask ? ` •${a.mask}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Total spending:{" "}
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  ${data?.totals.spending?.toFixed(2) ?? "0.00"}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-12">
            {chartView === "sankey" ? (
              <SankeyClient data={data?.sankey ?? { nodes: [], links: [] }} />
            ) : (
              <PieClient slices={pieSlices} />
            )}
          </div>

          <div className="lg:col-span-12">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold">By category</div>
                  <div className="mt-3 max-h-[240px] overflow-auto">
                    <ul className="space-y-2 text-sm">
                      {(() => {
                        const categories = (data?.totals.byCategory ?? []).map((x) => x.category);
                        const colorMap = getCategoryColorMap(categories);
                        return (data?.totals.byCategory ?? []).slice(0, 50).map((x) => (
                          <li key={x.category} className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 truncate">
                              <span
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: colorMap.get(x.category) ?? "#94a3b8" }}
                              />
                              <span className="truncate text-zinc-700 dark:text-zinc-300">
                                {formatCategoryLabel(x.category)}
                              </span>
                            </span>
                            <span className="tabular-nums text-zinc-950 dark:text-zinc-50">
                              ${x.total.toFixed(2)}
                            </span>
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold">By account</div>
                  <div className="mt-3 max-h-[240px] overflow-auto">
                    <ul className="space-y-2 text-sm">
                      {(data?.totals.byAccount ?? []).slice(0, 50).map((x) => (
                        <li key={x.account} className="flex justify-between gap-3">
                          <span className="truncate text-zinc-700 dark:text-zinc-300">
                            {x.account}
                          </span>
                          <span className="tabular-nums text-zinc-950 dark:text-zinc-50">
                            ${x.total.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-12">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-semibold">Transactions</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  Showing up to 500
                </div>
              </div>

              <div className="mt-3 overflow-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-600 dark:text-zinc-400">
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        Date
                      </th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        Merchant
                      </th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        Account
                      </th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        Amount
                      </th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        Category
                      </th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        Rule
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.transactions ?? []).map((t) => (
                      <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700 dark:border-zinc-900 dark:text-zinc-300">
                          {t.date}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-950 dark:border-zinc-900 dark:text-zinc-50">
                          {t.merchant}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700 dark:border-zinc-900 dark:text-zinc-300">
                          {t.accountName}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 tabular-nums text-zinc-950 dark:border-zinc-900 dark:text-zinc-50">
                          ${t.amount.toFixed(2)}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
                          <select
                            value={t.overrideCategory ?? "__plaid__"}
                            onChange={(e) => setOverride(t.id, e.target.value)}
                            disabled={busy}
                            className="w-[220px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <option value="__plaid__">
                              Use Plaid ({formatCategoryLabel(t.plaidCategory ?? "—")})
                            </option>
                            {DEFAULT_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
                          <button
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                            onClick={() =>
                              saveRule(t.merchant, t.overrideCategory ?? "")
                            }
                            disabled={busy || !t.overrideCategory}
                            title="Create a contains rule for this merchant/description"
                          >
                            Save rule
                          </button>
                        </td>
                      </tr>
                    ))}
                    {data?.transactions?.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400"
                        >
                          No transactions yet. Connect via Plaid Link, then
                          “Seed fake transactions”.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
