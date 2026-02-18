import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const BodySchema = z.object({
  matchType: z.enum(["contains", "regex"]).default("contains"),
  pattern: z.string().min(1),
  category: z.string().min(1),
  applyNow: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const rule = await db.rule.create({
      data: {
        matchType: body.matchType,
        pattern: body.pattern,
        category: body.category,
      },
      select: { id: true },
    });

    if (!body.applyNow || body.matchType !== "contains") {
      return NextResponse.json({ ok: true, rule });
    }

    const candidates = await db.transaction.findMany({
      where: {
        OR: [
          { merchantName: { contains: body.pattern } },
          { name: { contains: body.pattern } },
          { originalDescription: { contains: body.pattern } },
        ],
      },
      select: { id: true },
      take: 500,
    });

    for (const tx of candidates) {
      await db.categoryOverride.upsert({
        where: { transactionId: tx.id },
        update: { category: body.category },
        create: { transactionId: tx.id, category: body.category },
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true, rule, applied: candidates.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

