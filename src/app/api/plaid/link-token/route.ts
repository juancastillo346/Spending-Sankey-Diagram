import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";

import { getPlaidClient } from "@/lib/plaid";

export async function POST() {
  try {
    const plaid = getPlaidClient();
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: "local-user" },
      client_name: "IncomeManager",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      transactions: { days_requested: 180 },
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

