/*
  Warnings:

  - A unique constraint covering the columns `[current_suspension_id]` on the table `Driver` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'dispute_warning';
ALTER TYPE "NotificationType" ADD VALUE 'suspension_scheduled';
ALTER TYPE "NotificationType" ADD VALUE 'suspension_started';
ALTER TYPE "NotificationType" ADD VALUE 'suspension_paused';
ALTER TYPE "NotificationType" ADD VALUE 'suspension_resumed';
ALTER TYPE "NotificationType" ADD VALUE 'ban_scheduled';
ALTER TYPE "NotificationType" ADD VALUE 'ban_applied';

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "current_suspension_id" INTEGER,
ADD COLUMN     "last_warning_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "driver_disciplinary_actions" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "dispute_count" INTEGER NOT NULL,
    "suspension_days" INTEGER,
    "scheduled_start" TIMESTAMP(3),
    "scheduled_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_disciplinary_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_disciplinary_actions_driver_id_idx" ON "driver_disciplinary_actions"("driver_id");

-- CreateIndex
CREATE INDEX "driver_disciplinary_actions_period_start_period_end_idx" ON "driver_disciplinary_actions"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "driver_disciplinary_actions_is_paused_idx" ON "driver_disciplinary_actions"("is_paused");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_current_suspension_id_key" ON "Driver"("current_suspension_id");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_current_suspension_id_fkey" FOREIGN KEY ("current_suspension_id") REFERENCES "driver_disciplinary_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_disciplinary_actions" ADD CONSTRAINT "driver_disciplinary_actions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
