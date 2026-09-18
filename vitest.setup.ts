import "dotenv/config";

// Integration tests CREATE AND DELETE rows in the database they point at.
// They must never touch a remote database by accident (e.g. when .env's
// DATABASE_URL is switched to Neon for deployment work):
//
//   - TEST_DATABASE_URL, when set, overrides DATABASE_URL for the test run.
//   - If the effective URL is not local, the run aborts (fail closed).
//     ALLOW_REMOTE_TEST_DB=1 exists as a deliberate, explicit override.
//
// Start the local database with `npm run db:local` (see README).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
if (!isLocal && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
  throw new Error(
    [
      "Refusing to run tests: DATABASE_URL does not look local, and integration",
      "tests write to and clean the database they target.",
      "Fix: set TEST_DATABASE_URL to your local database, e.g.",
      '  TEST_DATABASE_URL="postgresql://postgres:password@localhost:5433/insurance_mvp"',
      "(start it with `npm run db:local`), or set ALLOW_REMOTE_TEST_DB=1 to",
      "override deliberately.",
    ].join("\n"),
  );
}
