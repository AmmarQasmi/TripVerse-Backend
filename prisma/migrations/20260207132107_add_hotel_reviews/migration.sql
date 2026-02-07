/*
  Warnings:

  - The values [car_listing_created] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('booking_request', 'booking_accepted', 'booking_rejected', 'booking_confirmed', 'trip_started', 'trip_completed', 'payment_received', 'driver_verification', 'hotel_manager_verification_approved', 'hotel_manager_verification_rejected', 'dispute_raised', 'dispute_resolved', 'dispute_warning', 'suspension_scheduled', 'suspension_started', 'suspension_paused', 'suspension_resumed', 'ban_scheduled', 'ban_applied', 'hotel_listing_created', 'hotel_booking_created', 'hotel_booking_confirmed', 'hotel_booking_payment_received', 'hotel_review_received', 'chat_message');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- CreateTable
CREATE TABLE "hotel_reviews" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "hotel_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_reviews_hotel_id_created_at_idx" ON "hotel_reviews"("hotel_id", "created_at");

-- CreateIndex
CREATE INDEX "hotel_reviews_user_id_idx" ON "hotel_reviews"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_reviews_user_id_hotel_id_key" ON "hotel_reviews"("user_id", "hotel_id");

-- CreateIndex
CREATE INDEX "HotelBooking_room_type_id_idx" ON "HotelBooking"("room_type_id");

-- CreateIndex
CREATE INDEX "HotelBooking_room_type_id_status_check_in_check_out_idx" ON "HotelBooking"("room_type_id", "status", "check_in", "check_out");

-- AddForeignKey
ALTER TABLE "hotel_reviews" ADD CONSTRAINT "hotel_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_reviews" ADD CONSTRAINT "hotel_reviews_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
