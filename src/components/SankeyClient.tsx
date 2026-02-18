"use client";

import { ResponsiveSankey } from "@nivo/sankey";

import { CATEGORY_PALETTE, formatCategoryLabel } from "@/lib/categories";

export type SankeyData = {
  nodes: Array<{ id: string }>;
  links: Array<{ source: string; target: string; value: number }>;
};

// White for accounts
const ACCOUNT_COLOR = "#FFFFFF";

export function SankeyClient({ data }: { data: SankeyData }) {
  if (!data.nodes.length || !data.links.length) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        No spending data for this range yet.
      </div>
    );
  }

  const accountIds = new Set(data.links.map((l) => l.source));
  let categoryIndex = 0;

  const nodeColorMap = new Map<string, string>();
  const nodeColors = data.nodes.map((node) => {
    if (accountIds.has(node.id)) {
      nodeColorMap.set(node.id, ACCOUNT_COLOR);
      return ACCOUNT_COLOR;
    }
    const color = CATEGORY_PALETTE[categoryIndex % CATEGORY_PALETTE.length];
    categoryIndex++;
    nodeColorMap.set(node.id, color);
    return color;
  });

  const dataWithColorMatchedLinks = {
    nodes: data.nodes,
    links: data.links.map((link) => {
      const targetColor = nodeColorMap.get(link.target) ?? CATEGORY_PALETTE[0];
      return {
        ...link,
        startColor: targetColor,
        endColor: targetColor,
      };
    }),
  };

  return (
    <div className="h-[560px] w-full min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <ResponsiveSankey
        data={dataWithColorMatchedLinks}
        margin={{ top: 40, right: 180, bottom: 40, left: 180 }}
        theme={{
          labels: { text: { fontSize: 14 } },
        }}
        align="justify"
        colors={nodeColors}
        nodeOpacity={1}
        nodeThickness={14}
        nodeInnerPadding={4}
        nodeSpacing={18}
        nodeBorderWidth={1}
        nodeBorderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        linkOpacity={1}
        linkHoverOthersOpacity={0.5}
        enableLinkGradient={true}
        linkBlendMode="normal"
        layers={[
          "links",
          "nodes",
          "labels",
          (props: { links?: unknown }) => {
            const links = props.links ?? [];
            return (
              <g pointerEvents="none">
                {links.map((link, idx) => {
                  const src = link.source;
                  const tgt = link.target;
                  if (!src || !tgt) return null;
                  const srcRight = src.x1 ?? (src.x !== undefined && src.width !== undefined ? src.x + src.width : 0);
                  const tgtLeft = tgt.x0 ?? tgt.x ?? 0;
                  const midX = (srcRight + tgtLeft) / 2;
                  const midY = ((link.pos0 ?? 0) + (link.pos1 ?? 0)) / 2;
                  const text = `$${Number(link.value ?? 0).toFixed(2)}`;
                  const paddingX = 10;
                  const paddingY = 6;
                  const rectWidth = Math.max(text.length * 8, 40) + paddingX * 2;
                  const rectHeight = 18 + paddingY;
                  return (
                    <g key={idx} style={{ pointerEvents: "none", userSelect: "none" }}>
                      <rect
                        x={midX - rectWidth / 2}
                        y={midY - rectHeight / 2}
                        width={rectWidth}
                        height={rectHeight}
                        rx={8}
                        fill="rgba(0,0,0,0.8)"
                      />
                      <text
                        x={midX}
                        y={midY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={13}
                        fontWeight={500}
                        fill="#ffffff"
                      >
                        {text}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          },
        ]}
        label={(node) => (accountIds.has(node.id) ? node.id : formatCategoryLabel(node.id))}
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={10}
        labelTextColor={{ from: "color", modifiers: [["darker", 1.2]] }}
        nodeTooltip={({ node }) => (
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="font-medium">{accountIds.has(node.id) ? node.id : formatCategoryLabel(node.id)}</div>
            <div className="text-zinc-600 dark:text-zinc-400">
              Total: ${Number(node.value ?? 0).toFixed(2)}
            </div>
          </div>
        )}
        linkTooltip={({ link }) => (
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="font-medium">
              {accountIds.has(link.source.id) ? link.source.id : formatCategoryLabel(link.source.id)} → {accountIds.has(link.target.id) ? link.target.id : formatCategoryLabel(link.target.id)}
            </div>
            <div className="text-zinc-600 dark:text-zinc-400">
              ${Number(link.value ?? 0).toFixed(2)}
            </div>
          </div>
        )}
      />
    </div>
  );
}

