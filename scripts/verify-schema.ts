/**
 * Schema verification — actively exercises every constraint from docs/DATABASE.md
 * against a real PostgreSQL database (run: npx tsx scripts/verify-schema.ts).
 * Safe to run on a fresh or seeded DB: uses throwaway rows with fixed UUIDs and
 * cleans up after itself. Exits non-zero on any failed expectation.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Throwaway ids (valid v4-shaped UUIDs)
const A1 = "00000000-0000-4000-8000-00000000a001"; // agent 1
const A2 = "00000000-0000-4000-8000-00000000a002"; // agent 2
const C1 = "00000000-0000-4000-8000-00000000c001"; // customer of agent 1
const P1 = "00000000-0000-4000-8000-00000000f001"; // product
const APP1 = "00000000-0000-4000-8000-00000000e001";
const APP2 = "00000000-0000-4000-8000-00000000e002";
const PAY1 = "00000000-0000-4000-8000-00000000d001";
const PAY2 = "00000000-0000-4000-8000-00000000d002";
const POL1 = "00000000-0000-4000-8000-00000000b001";
const POL2 = "00000000-0000-4000-8000-00000000b002";

let pass = 0;
let fail = 0;

function ok(name: string) {
  pass++;
  console.log(`  ✓ ${name}`);
}
function bad(name: string, detail?: string) {
  fail++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectOk(name: string, sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    ok(name);
  } catch (e) {
    bad(name, (e as Error).message.split("\n")[0]);
  }
}

async function expectFail(name: string, sql: string, needle: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    bad(name, "statement unexpectedly succeeded");
  } catch (e) {
    // PG reports CHECK violations by constraint name, unique violations by key
    // columns ("Key (agent_id, phone)=… already exists"); Prisma puts detail in
    // both message and meta — match across the whole thing.
    const err = e as Error & { meta?: unknown };
    const full = String(err.message) + JSON.stringify(err.meta ?? {});
    if (full.includes(needle)) ok(name);
    else bad(name, `failed for the wrong reason: ${full.slice(0, 160)}`);
  }
}

async function cleanup() {
  // FK order: children first
  await prisma.$executeRawUnsafe(`DELETE FROM policies WHERE id IN ('${POL1}','${POL2}')`);
  await prisma.$executeRawUnsafe(`DELETE FROM payments WHERE id IN ('${PAY1}','${PAY2}')`);
  await prisma.$executeRawUnsafe(`DELETE FROM applications WHERE id IN ('${APP1}','${APP2}')`);
  await prisma.$executeRawUnsafe(`DELETE FROM customers WHERE id = '${C1}'`);
  await prisma.$executeRawUnsafe(`DELETE FROM products WHERE id = '${P1}'`);
  await prisma.$executeRawUnsafe(`DELETE FROM agents WHERE id IN ('${A1}','${A2}')`);
}

async function main() {
  console.log("— Structure —");
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  const names = tables.map((t) => t.table_name);
  const expected = ["agents", "applications", "communications", "customers", "payments", "policies", "products"];
  for (const t of expected) {
    if (names.includes(t)) ok(`table ${t}`);
    else bad(`table ${t} missing`);
  }

  const idx = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'`,
  );
  const hasIdx = (n: string, mustContain: string) => {
    const row = idx.find((i) => i.indexname === n);
    if (row && row.indexdef.includes(mustContain)) ok(`index ${n} (predicate verified)`);
    else bad(`index ${n}`, row ? "predicate mismatch" : "missing");
  };
  hasIdx("app_one_open_per_customer_product", "WHERE (status <> 'EXPIRED'");
  hasIdx("pay_one_open_per_application", "WHERE (status = 'CREATED'");

  const cons = await prisma.$queryRawUnsafe<{ conname: string }[]>(
    `SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
  );
  for (const c of [
    "app_pdf_when_not_draft",
    "app_consent_before_money",
    "app_premium_positive",
    "pay_amount_positive",
    "prod_money_positive",
    "cust_vehicle_year_required",
    "applications_customer_id_agent_id_fkey",
  ]) {
    if (cons.some((x) => x.conname === c)) ok(`constraint ${c}`);
    else bad(`constraint ${c} missing`);
  }

  console.log("— Behavior (real inserts) —");
  await cleanup(); // in case of a previous partial run

  await expectOk(
    "insert two agents",
    `INSERT INTO agents (id, name, email, password_hash, updated_at) VALUES
     ('${A1}','Verify Agent 1','verify1@example.com','x', now()),
     ('${A2}','Verify Agent 2','verify2@example.com','x', now())`,
  );

  await expectFail(
    "CHECK cust_vehicle_year_required (owns vehicle, year NULL)",
    `INSERT INTO customers (id, agent_id, name, phone, email, dob, annual_income, city, is_smoker, owns_vehicle, vehicle_year, updated_at)
     VALUES ('${C1}','${A1}','V','+919999900001','v@example.com','1990-01-01',100000,'X',false,true,NULL,now())`,
    "cust_vehicle_year_required",
  );

  await expectOk(
    "insert customer (agent 1)",
    `INSERT INTO customers (id, agent_id, name, phone, email, dob, annual_income, city, is_smoker, owns_vehicle, vehicle_year, updated_at)
     VALUES ('${C1}','${A1}','V','+919999900001','v@example.com','1990-01-01',100000,'X',false,false,NULL,now())`,
  );

  await expectFail(
    "UNIQUE (agent_id, phone) duplicate",
    `INSERT INTO customers (id, agent_id, name, phone, email, dob, annual_income, city, is_smoker, owns_vehicle, updated_at)
     VALUES ('00000000-0000-4000-8000-00000000c002','${A1}','V2','+919999900001','v2@example.com','1990-01-01',100000,'X',false,false,now())`,
    "Key (agent_id, phone)",
  );

  await expectFail(
    "CHECK prod_money_positive (zero premium)",
    `INSERT INTO products (id, category, name, description, coverage_amount, base_premium, eligibility_rules, premium_factors, updated_at)
     VALUES ('${P1}','TERM','V','d',100,0,'{}','{}',now())`,
    "prod_money_positive",
  );

  await expectOk(
    "insert product",
    `INSERT INTO products (id, category, name, description, coverage_amount, base_premium, eligibility_rules, premium_factors, updated_at)
     VALUES ('${P1}','TERM','V','d',500000000,800000,'{}','{}',now())`,
  );

  await expectFail(
    "composite FK rejects wrong agent for customer",
    `INSERT INTO applications (id, agent_id, customer_id, product_id, status, premium_amount, valid_until, review_token, updated_at)
     VALUES ('${APP1}','${A2}','${C1}','${P1}','DRAFT',100000, now() + interval '30 days','tok-verify-1',now())`,
    "applications_customer_id_agent_id_fkey",
  );

  await expectFail(
    "CHECK app_pdf_when_not_draft (QUOTE_GENERATED without pdf)",
    `INSERT INTO applications (id, agent_id, customer_id, product_id, status, premium_amount, valid_until, review_token, updated_at)
     VALUES ('${APP1}','${A1}','${C1}','${P1}','QUOTE_GENERATED',100000, now() + interval '30 days','tok-verify-1',now())`,
    "app_pdf_when_not_draft",
  );

  await expectFail(
    "CHECK app_consent_before_money (AGREED without agreed_at)",
    `INSERT INTO applications (id, agent_id, customer_id, product_id, status, premium_amount, valid_until, review_token, pdf_url, updated_at)
     VALUES ('${APP1}','${A1}','${C1}','${P1}','AGREED',100000, now() + interval '30 days','tok-verify-1','http://x/pdf',now())`,
    "app_consent_before_money",
  );

  await expectOk(
    "insert application (QUOTE_GENERATED with pdf)",
    `INSERT INTO applications (id, agent_id, customer_id, product_id, status, premium_amount, valid_until, review_token, pdf_url, updated_at)
     VALUES ('${APP1}','${A1}','${C1}','${P1}','QUOTE_GENERATED',100000, now() + interval '30 days','tok-verify-1','http://x/pdf',now())`,
  );

  await expectFail(
    "partial unique blocks second open application (same customer+product)",
    `INSERT INTO applications (id, agent_id, customer_id, product_id, status, premium_amount, valid_until, review_token, updated_at)
     VALUES ('${APP2}','${A1}','${C1}','${P1}','DRAFT',100000, now() + interval '30 days','tok-verify-2',now())`,
    "Key (customer_id, product_id)",
  );

  await expectOk(
    "expire first application (lazy write-back path)",
    `UPDATE applications SET status='EXPIRED' WHERE id='${APP1}'`,
  );

  await expectOk(
    "EXPIRED frees the slot — second application now allowed",
    `INSERT INTO applications (id, agent_id, customer_id, product_id, status, premium_amount, valid_until, review_token, updated_at)
     VALUES ('${APP2}','${A1}','${C1}','${P1}','DRAFT',100000, now() + interval '30 days','tok-verify-2',now())`,
  );

  await expectOk(
    "insert open payment (CREATED)",
    `INSERT INTO payments (id, application_id, provider_link_id, amount, status, updated_at)
     VALUES ('${PAY1}','${APP2}','plink_verify_1',100000,'CREATED',now())`,
  );

  await expectFail(
    "partial unique blocks second OPEN payment on same application",
    `INSERT INTO payments (id, application_id, provider_link_id, amount, status, updated_at)
     VALUES ('${PAY2}','${APP2}','plink_verify_2',100000,'CREATED',now())`,
    "Key (application_id)",
  );

  await expectOk(
    "cancel first payment, then a new open payment is allowed",
    `UPDATE payments SET status='CANCELLED' WHERE id='${PAY1}'`,
  );
  await expectOk(
    "second payment after cancel",
    `INSERT INTO payments (id, application_id, provider_link_id, amount, status, updated_at)
     VALUES ('${PAY2}','${APP2}','plink_verify_2',100000,'CREATED',now())`,
  );

  await expectOk(
    "set provider_payment_id on first payment",
    `UPDATE payments SET provider_payment_id='pay_dup' WHERE id='${PAY1}'`,
  );
  await expectFail(
    "UNIQUE provider_payment_id (idempotency anchor)",
    `UPDATE payments SET provider_payment_id='pay_dup' WHERE id='${PAY2}'`,
    "Key (provider_payment_id)",
  );

  await expectOk(
    "insert policy",
    `INSERT INTO policies (id, application_id, policy_number, start_date, end_date)
     VALUES ('${POL1}','${APP2}','POL-VERIFY-1', now()::date, (now() + interval '1 year')::date)`,
  );
  await expectFail(
    "UNIQUE policies.application_id (one policy per application — fail-closed backstop)",
    `INSERT INTO policies (id, application_id, policy_number, start_date, end_date)
     VALUES ('${POL2}','${APP2}','POL-VERIFY-2', now()::date, (now() + interval '1 year')::date)`,
    "Key (application_id)",
  );

  console.log("— Sequence —");
  const seq = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('policy_number_seq') AS n`);
  const n1 = Number(seq[0].n);
  const seq2 = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('policy_number_seq') AS n`);
  const n2 = Number(seq2[0].n);
  if (n2 === n1 + 1) ok(`policy_number_seq increments (${n1} → ${n2}); sample: POL-2026-${String(n1).padStart(6, "0")}`);
  else bad("policy_number_seq increment");
  // leave the sequence where verification found it minus test consumption
  await prisma.$executeRawUnsafe(`SELECT setval('policy_number_seq', GREATEST(${n1} - 1, 1), ${n1 > 1})`);

  await cleanup();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
