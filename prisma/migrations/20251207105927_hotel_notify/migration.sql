-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'hotel_listing_created';
ALTER TYPE "NotificationType" ADD VALUE 'hotel_booking_created';
ALTER TYPE "NotificationType" ADD VALUE 'hotel_booking_confirmed';
ALTER TYPE "NotificationType" ADD VALUE 'hotel_booking_payment_received';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "payload" JSONB;
