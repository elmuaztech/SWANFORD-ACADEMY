-- AlterTable: Add billingMonth, billingPeriodName, isSpecialRate to invoices
ALTER TABLE "invoices" 
ADD COLUMN IF NOT EXISTS "billing_month" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "billing_period_name" TEXT,
ADD COLUMN IF NOT EXISTS "is_special_rate" BOOLEAN NOT NULL DEFAULT false;

-- Update unique constraint on invoices to include billing_month
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_student_id_programme_id_academic_session_id_acad_key";
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_student_id_programme_id_academic_session_id_academ_key";
DROP INDEX IF EXISTS "invoices_student_id_programme_id_academic_session_id_academ_key";
DROP INDEX IF EXISTS "invoices_student_id_programme_id_academic_session_id_acad_key";
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "unique_student_programme_term_invoice";

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_student_programme_term_invoice'
    ) THEN
        ALTER TABLE "invoices" 
        ADD CONSTRAINT "unique_student_programme_term_invoice" 
        UNIQUE ("student_id", "programme_id", "academic_session_id", "academic_term_id", "billing_month");
    END IF;
END $$;

-- CreateTable: student_special_fee_rates
CREATE TABLE IF NOT EXISTS "student_special_fee_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "academic_term_id" UUID,
    "fee_structure_id" UUID,
    "custom_amount_kobo" BIGINT,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_special_fee_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "student_special_fee_rates_student_id_is_active_idx" 
ON "student_special_fee_rates"("student_id", "is_active");

CREATE INDEX IF NOT EXISTS "student_special_fee_rates_programme_id_academic_session_id_idx" 
ON "student_special_fee_rates"("programme_id", "academic_session_id");

-- Foreign Keys
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_special_fee_rates_student_id_fkey'
    ) THEN
        ALTER TABLE "student_special_fee_rates" 
        ADD CONSTRAINT "student_special_fee_rates_student_id_fkey" 
        FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_special_fee_rates_programme_id_fkey'
    ) THEN
        ALTER TABLE "student_special_fee_rates" 
        ADD CONSTRAINT "student_special_fee_rates_programme_id_fkey" 
        FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_special_fee_rates_academic_session_id_fkey'
    ) THEN
        ALTER TABLE "student_special_fee_rates" 
        ADD CONSTRAINT "student_special_fee_rates_academic_session_id_fkey" 
        FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_special_fee_rates_academic_term_id_fkey'
    ) THEN
        ALTER TABLE "student_special_fee_rates" 
        ADD CONSTRAINT "student_special_fee_rates_academic_term_id_fkey" 
        FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_special_fee_rates_fee_structure_id_fkey'
    ) THEN
        ALTER TABLE "student_special_fee_rates" 
        ADD CONSTRAINT "student_special_fee_rates_fee_structure_id_fkey" 
        FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'student_special_fee_rates_assigned_by_user_id_fkey'
    ) THEN
        ALTER TABLE "student_special_fee_rates" 
        ADD CONSTRAINT "student_special_fee_rates_assigned_by_user_id_fkey" 
        FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
