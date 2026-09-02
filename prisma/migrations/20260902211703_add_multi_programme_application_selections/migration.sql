/*
  Warnings:

  - You are about to drop the column `application_fee_kobo` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the column `application_fee_status` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the column `enroll_in_tahfeez` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the column `target_class_id` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the column `target_main_programme_id` on the `applications` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProgrammeSelectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationChargeType" AS ENUM ('APPLICATION_FORM_FEE', 'PROGRAMME_TUITION', 'UNIFORM_CLOTHING', 'BOOKS_STATIONERY', 'EXAM_MEDICAL', 'OTHER');

-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'PARTIALLY_APPROVED';

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_target_class_id_fkey";

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_target_main_programme_id_fkey";

-- AlterTable
ALTER TABLE "applications" DROP COLUMN "application_fee_kobo",
DROP COLUMN "application_fee_status",
DROP COLUMN "enroll_in_tahfeez",
DROP COLUMN "target_class_id",
DROP COLUMN "target_main_programme_id",
ADD COLUMN     "amount_paid_kobo" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payment_status" "FeeStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "total_amount_kobo" BIGINT NOT NULL DEFAULT 500000;

-- CreateTable
CREATE TABLE "application_programme_selections" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "target_class_id" UUID,
    "status" "ProgrammeSelectionStatus" NOT NULL DEFAULT 'PENDING',
    "decision_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_programme_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_charge_items" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "programme_selection_id" UUID,
    "charge_type" "ApplicationChargeType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "unit_amount_kobo" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total_amount_kobo" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_charge_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_programme_selections_application_id_idx" ON "application_programme_selections"("application_id");

-- CreateIndex
CREATE INDEX "application_programme_selections_programme_id_status_idx" ON "application_programme_selections"("programme_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_programme_selections_application_id_programme_i_key" ON "application_programme_selections"("application_id", "programme_id");

-- CreateIndex
CREATE INDEX "application_charge_items_application_id_idx" ON "application_charge_items"("application_id");

-- CreateIndex
CREATE INDEX "application_charge_items_programme_selection_id_idx" ON "application_charge_items"("programme_selection_id");

-- AddForeignKey
ALTER TABLE "application_programme_selections" ADD CONSTRAINT "application_programme_selections_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_programme_selections" ADD CONSTRAINT "application_programme_selections_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_programme_selections" ADD CONSTRAINT "application_programme_selections_target_class_id_fkey" FOREIGN KEY ("target_class_id") REFERENCES "school_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_programme_selections" ADD CONSTRAINT "application_programme_selections_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_charge_items" ADD CONSTRAINT "application_charge_items_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_charge_items" ADD CONSTRAINT "application_charge_items_programme_selection_id_fkey" FOREIGN KEY ("programme_selection_id") REFERENCES "application_programme_selections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
