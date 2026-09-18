-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('TERM', 'HEALTH', 'VEHICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'QUOTE_GENERATED', 'AGREED', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "CommMode" AS ENUM ('DEMO', 'LIVE', 'LOG');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('LOGGED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "annual_income" BIGINT NOT NULL,
    "city" TEXT NOT NULL,
    "is_smoker" BOOLEAN NOT NULL,
    "owns_vehicle" BOOLEAN NOT NULL,
    "vehicle_year" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverage_amount" BIGINT NOT NULL,
    "base_premium" BIGINT NOT NULL,
    "eligibility_rules" JSONB NOT NULL,
    "premium_factors" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "premium_amount" BIGINT NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "review_token" TEXT NOT NULL,
    "pdf_url" TEXT,
    "agreed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "provider_link_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "raw_webhook_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "policy_number" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "mode" "CommMode" NOT NULL,
    "template_key" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "rendered_content" TEXT NOT NULL,
    "status" "CommStatus" NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_email_key" ON "agents"("email");

-- CreateIndex
CREATE INDEX "customers_agent_id_idx" ON "customers"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_agent_id_phone_key" ON "customers"("agent_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_agent_id_key" ON "customers"("id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_review_token_key" ON "applications"("review_token");

-- CreateIndex
CREATE INDEX "applications_agent_id_created_at_idx" ON "applications"("agent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "applications_customer_id_idx" ON "applications"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_link_id_key" ON "payments"("provider_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_application_id_idx" ON "payments"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_application_id_key" ON "policies"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_policy_number_key" ON "policies"("policy_number");

-- CreateIndex
CREATE INDEX "communications_application_id_created_at_idx" ON "communications"("application_id", "created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_customer_id_agent_id_fkey" FOREIGN KEY ("customer_id", "agent_id") REFERENCES "customers"("id", "agent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Constraints beyond Prisma's modeling (docs/DATABASE.md — pressure-test deltas)
-- ============================================================================

-- One live application per customer+product (EXPIRED frees the slot)
CREATE UNIQUE INDEX "app_one_open_per_customer_product"
  ON "applications"("customer_id", "product_id")
  WHERE "status" <> 'EXPIRED';

-- At most one open payment link per application (regenerate must cancel first)
CREATE UNIQUE INDEX "pay_one_open_per_application"
  ON "payments"("application_id")
  WHERE "status" = 'CREATED';

-- DRAFT is exactly the no-PDF state
ALTER TABLE "applications" ADD CONSTRAINT "app_pdf_when_not_draft"
  CHECK ("status" = 'DRAFT' OR "pdf_url" IS NOT NULL);

-- Consent must be recorded before money moves
ALTER TABLE "applications" ADD CONSTRAINT "app_consent_before_money"
  CHECK ("status" IN ('DRAFT', 'QUOTE_GENERATED', 'EXPIRED') OR "agreed_at" IS NOT NULL);

-- Positive money everywhere
ALTER TABLE "applications" ADD CONSTRAINT "app_premium_positive"
  CHECK ("premium_amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "pay_amount_positive"
  CHECK ("amount" > 0);
ALTER TABLE "products" ADD CONSTRAINT "prod_money_positive"
  CHECK ("base_premium" > 0 AND "coverage_amount" > 0);

-- Eligibility evaluator must be total: vehicle year required iff owns a vehicle
ALTER TABLE "customers" ADD CONSTRAINT "cust_vehicle_year_required"
  CHECK ("owns_vehicle" = false OR "vehicle_year" IS NOT NULL);

-- Concurrency-safe policy numbering (POL-YYYY-NNNNNN); no max+1
CREATE SEQUENCE "policy_number_seq" START 1;
