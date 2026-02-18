import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPlaidClient } from "@/lib/plaid";

const BodySchema = z.object({
  public_token: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const plaid = getPlaidClient();

    const exchange = await plaid.itemPublicTokenExchange({
      public_token: body.public_token,
    });

    const accessToken = exchange.data.access_token;
    const plaidItemId = exchange.data.item_id;

    const item = await db.item.upsert({
      where: { plaidItemId },
      update: { accessToken },
      create: { plaidItemId, accessToken },
      select: { id: true, plaidItemId: true },
    });

    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

