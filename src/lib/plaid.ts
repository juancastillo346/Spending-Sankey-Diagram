import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

import { getEnv } from "@/lib/env";

export function getPlaidClient(): PlaidApi {
  const env = getEnv();
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env.PLAID_ENV],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
        "PLAID-SECRET": env.PLAID_SECRET,
      },
    },
  });

  return new PlaidApi(configuration);
}

