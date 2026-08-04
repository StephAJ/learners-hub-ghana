import { auth } from "../server/auth-config";
import { getPostgresPool } from "../db/postgres";

/* ==========================================================================
   Checking and resetting a local sign-in

   bootstrapAdministrator() in server/platform-ready.ts creates the
   administrator on first boot and then leaves the account alone forever — it
   calls signUpEmail only when no user with that email exists. That is right
   for the VPS, where the password is the administrator's to change and a
   deployment must never reset it.

   It is a trap locally. Change INITIAL_ADMIN_PASSWORD in .env.local after the
   first boot and nothing re-applies it: the stored hash is still the old
   password, the variable now says something else, and signing in fails with
   the credentials the file appears to promise. Nothing reports this, because
   from Better Auth's point of view it is an ordinary wrong password.

   Run with no arguments to find out which account exists and whether the
   configured password actually opens it:

     npx tsx scripts/admin-password.ts

   Add --reset to write the configured password onto the account:

     npx tsx scripts/admin-password.ts --reset

   Hashing goes through Better Auth's own context rather than a hash function
   chosen here, so what this writes is exactly what sign-in will verify.
   ========================================================================== */

type AccountRow = {
  accountId: string;
  email: string;
  name: string;
  password: string | null;
  userId: string;
};

async function main() {
  const reset = process.argv.includes("--reset");
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    fail(
      "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD both have to be set.\n" +
        "Run this with the environment file loaded:\n" +
        "  node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/admin-password.ts",
    );
    return;
  }

  const database = getPostgresPool();
  const result = await database.query<AccountRow>(
    `SELECT u.id AS "userId", u.email, u.name, a.id AS "accountId", a.password
       FROM "user" AS u
       LEFT JOIN account AS a
         ON a."userId" = u.id AND a."providerId" = 'credential'
      WHERE lower(u.email) = $1
      LIMIT 1`,
    [email],
  );

  const account = result.rows[0];
  console.log(`\nConfigured administrator: ${email}`);

  if (!account) {
    /* Much the most common reason a local sign-in fails: the credentials being
       typed are the VPS ones, and this database has never heard of them. */
    console.log("  No account with that email exists in this database.\n");
    await listSignableAccounts(database);
    console.log(
      "Either sign in as one of the accounts above, or set INITIAL_ADMIN_EMAIL\n" +
        "to the address you want and restart the dev server to have it created.\n",
    );
    await database.end();
    return;
  }

  console.log(`  Account exists (${account.name}).`);

  if (!account.password) {
    console.log(
      "  It has no credential password — it cannot be signed into at all.",
    );
    if (!reset) {
      console.log("  Re-run with --reset to set one.\n");
      await database.end();
      return;
    }
  } else {
    const context = await auth.$context;
    const matches = await context.password.verify({
      hash: account.password,
      password,
    });

    if (matches) {
      console.log(
        "  INITIAL_ADMIN_PASSWORD does open this account.\n\n" +
          "So the password in .env.local is correct and the failure is elsewhere:\n" +
          "  · check the email being typed is exactly the one above\n" +
          "  · check BETTER_AUTH_URL matches the origin you are browsing\n" +
          "  · a rate limit applies after repeated failures — wait a minute\n",
      );
      await listSignableAccounts(database);
      await database.end();
      return;
    }

    console.log(
      "  INITIAL_ADMIN_PASSWORD does NOT match the stored password.\n" +
        "  The account was created with a different one and nothing has\n" +
        "  re-applied the variable since.",
    );
    if (!reset) {
      console.log("\n  Re-run with --reset to make .env.local authoritative.\n");
      await database.end();
      return;
    }
  }

  const context = await auth.$context;
  const hash = await context.password.hash(password);
  await context.internalAdapter.updatePassword(account.userId, hash);

  console.log(
    `\n  Reset. ${email} now signs in with the INITIAL_ADMIN_PASSWORD in your environment file.\n`,
  );
  await database.end();
}

/** The demo cast, when DEMO_ACCOUNTS put them there. */
async function listSignableAccounts(
  database: ReturnType<typeof getPostgresPool>,
) {
  const result = await database.query<{ email: string; role: string }>(
    `SELECT DISTINCT u.email, m.role
       FROM "user" AS u
       JOIN identity_accounts AS i ON i.provider_subject = u.id
       JOIN tenant_memberships AS m ON m.person_id = i.person_id
      WHERE m.status = 'active'
      ORDER BY m.role, u.email`,
  );

  if (result.rows.length === 0) return;
  console.log("Accounts that exist in this database:");
  for (const row of result.rows) {
    console.log(`  ${row.role.padEnd(20)} ${row.email}`);
  }
  if (process.env.DEMO_ACCOUNTS?.trim().toLowerCase() === "true") {
    console.log(
      "\nEveryone except the administrator signs in with DEMO_PASSWORD.\n",
    );
  }
}

function fail(message: string) {
  console.error(`\n${message}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nFailed:", error);
  process.exit(1);
});
