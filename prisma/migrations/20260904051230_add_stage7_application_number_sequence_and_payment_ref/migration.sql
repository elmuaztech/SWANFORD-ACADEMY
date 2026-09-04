-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "payment_reference" TEXT;

-- CreateTable
CREATE TABLE "application_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_number_sequences_pkey" PRIMARY KEY ("year")
);
