-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StudentStatus" ADD VALUE 'INACTIVE';
ALTER TYPE "StudentStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "guardian_student_relationships" ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "revoked_reason" TEXT,
ADD COLUMN     "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "guardians" ALTER COLUMN "phone_primary" DROP NOT NULL;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "emergency_contact_relationship" TEXT,
ADD COLUMN     "medical_conditions" TEXT,
ADD COLUMN     "preferred_name" TEXT;
