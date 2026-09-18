-- Payments need the payable URL for the review page and the WhatsApp
-- message; it is provider-issued and not derivable from the link id.
-- DEFAULT '' only eases the ALTER on non-empty tables; app code always writes it.
ALTER TABLE "payments" ADD COLUMN "short_url" TEXT NOT NULL DEFAULT '';
