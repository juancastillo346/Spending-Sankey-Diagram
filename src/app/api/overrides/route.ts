import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const BodySchema = z.object({
  transactionId: z.string().min(1), // plaidTransactionId
  category: z.string().min(1).nullable(), // null => clear override
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const tx = await db.transaction.findUnique({
      where: { plaidTransactionId: body.transactionId },
      select: { id: true },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (!body.category) {
      await db.categoryOverride.deleteMany({
        where: { transactionId: tx.id },
      });
      return NextResponse.json({ ok: true, cleared: true });
    }

    await db.categoryOverride.upsert({
      where: { transactionId: tx.id },
      update: { category: body.category },
      create: { transactionId: tx.id, category: body.category },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

