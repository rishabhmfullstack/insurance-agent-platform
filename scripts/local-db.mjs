// Local development PostgreSQL — real PG binaries via embedded-postgres
// (no Docker/system install needed; D-20). Run with: npm run db:local
// Data persists in var/local-postgres (gitignored). Ctrl+C stops it cleanly.
//
// First run: after this is up, apply migrations + seed against it:
//   TEST_DATABASE_URL / DATABASE_URL: postgresql://postgres:password@localhost:5433/insurance_mvp
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { existsSync } from "fs";

const DATA_DIR = "./var/local-postgres";
const PORT = 5433;

const server = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "password",
  port: PORT,
  persistent: true,
});

if (!existsSync(`${DATA_DIR}/PG_VERSION`)) {
  console.log("Initializing local PostgreSQL data directory…");
  await server.initialise();
}
await server.start();

// Windows initdb defaults to WIN1252, which cannot store "₹" — the database
// must be created with UTF8 explicitly (the encoding gotcha from D-20).
const client = new pg.Client({
  host: "localhost",
  port: PORT,
  user: "postgres",
  password: "password",
  database: "postgres",
});
await client.connect();
const exists = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = 'insurance_mvp'",
);
if (exists.rowCount === 0) {
  await client.query("CREATE DATABASE insurance_mvp ENCODING 'UTF8' TEMPLATE template0");
  console.log("Created database insurance_mvp (UTF8).");
  console.log("Next: npx prisma migrate deploy && npx prisma db seed");
  console.log("(with DATABASE_URL pointing at this server — see .env.example)");
}
await client.end();

console.log(
  `Local PostgreSQL ready: postgresql://postgres:password@localhost:${PORT}/insurance_mvp`,
);
console.log("Press Ctrl+C to stop.");

async function shutdown() {
  console.log("\nStopping local PostgreSQL…");
  await server.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {}); // hold the process open
