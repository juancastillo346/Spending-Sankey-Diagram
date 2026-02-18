"use client";

import { ResponsivePie } from "@nivo/pie";

import { formatCategoryLabel } from "@/lib/categories";

export type PieSlice = { id: string; label: string; value: number; color?: string };

export function PieClient({ slices }: { slices: PieSlice[] }) {
  const pieData = (slices ?? []).map((s) => ({
    id: s.label,
    label: s.label,
    value: s.value,
    color: s.color,
  }));

  if (!pieData.length) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        No spending data for this range yet.
      </div>
    );
  }

  return (
    <div className="h-[560px] w-full min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <ResponsivePie
        data={pieData}
        margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        activeOuterRadiusOffset={8}
        colors={{ datum: "data.color" } as { datum: string }}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        enableArcLabels={false}
        arcLinkLabelsSkipAngle={10}
        arcLinkLabelsTextColor="#6b7280"
        arcLinkLabelsThickness={2}
        arcLinkLabelsColor={{ from: "color" }}
        tooltip={({ datum: { id, value } }) => (
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="font-medium">{formatCategoryLabel(String(id))}</div>
            <div className="text-zinc-600 dark:text-zinc-400">
              ${Number(value ?? 0).toFixed(2)}
            </div>
          </div>
        )}
        legends={[
          {
            anchor: "right",
            direction: "column",
            justify: false,
            translateX: 60,
            translateY: 0,
            itemsSpacing: 6,
            itemWidth: 120,
            itemHeight: 18,
            itemTextColor: "#6b7280",
            symbolSize: 12,
            symbolShape: "circle",
          },
        ]}
      />
    </div>
  );
}
