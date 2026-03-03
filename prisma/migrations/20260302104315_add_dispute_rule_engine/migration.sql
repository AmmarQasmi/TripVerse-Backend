-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('service', 'pricing', 'cleanliness', 'safety', 'fraud');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'dispute_auto_action';
ALTER TYPE "NotificationType" ADD VALUE 'dispute_flagged';

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "automated_action" TEXT,
ADD COLUMN     "automated_action_applied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" "DisputeCategory" NOT NULL DEFAULT 'service',
ADD COLUMN     "flagged_for_manual_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "incident_at" TIMESTAMP(3),
ADD COLUMN     "reporter_user_id" INTEGER,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "score_breakdown" JSONB,
ADD COLUMN     "severity_score" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DisputeAttachment" ADD COLUMN     "cloudinary_public_id" TEXT,
ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "file_size" INTEGER,
ADD COLUMN     "quality_score" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "false_complaint_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "dispute_audit_logs" (
    "id" SERIAL NOT NULL,
    "dispute_id" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispute_audit_logs_dispute_id_idx" ON "dispute_audit_logs"("dispute_id");

-- CreateIndex
CREATE INDEX "dispute_audit_logs_created_at_idx" ON "dispute_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "Dispute_category_idx" ON "Dispute"("category");

-- CreateIndex
CREATE INDEX "Dispute_severity_score_idx" ON "Dispute"("severity_score");

-- CreateIndex
CREATE INDEX "Dispute_flagged_for_manual_review_idx" ON "Dispute"("flagged_for_manual_review");

-- CreateIndex
CREATE INDEX "Dispute_reporter_user_id_idx" ON "Dispute"("reporter_user_id");

-- CreateIndex
CREATE INDEX "DisputeAttachment_content_hash_idx" ON "DisputeAttachment"("content_hash");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_audit_logs" ADD CONSTRAINT "dispute_audit_logs_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
