/*
  Warnings:

  - The values [PENDING_PAYMENT] on the enum `BookingStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `rate_per_day` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `check_in` on the `CarBooking` table. All the data in the column will be lost.
  - You are about to drop the column `check_out` on the `CarBooking` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `CarBooking` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_charge_id` on the `PaymentTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_payment_intent_id` on the `PaymentTransaction` table. All the data in the column will be lost.
  - Added the required column `base_price_per_day` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `distance_rate_per_km` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fuel_type` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transmission` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `driver_earnings` to the `CarBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dropoff_location` to the `CarBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `end_date` to the `CarBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickup_location` to the `CarBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `platform_fee` to the `CarBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_date` to the `CarBooking` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('petrol', 'diesel', 'electric', 'hybrid');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('booking_request', 'booking_accepted', 'booking_rejected', 'booking_confirmed', 'trip_started', 'trip_completed', 'payment_received', 'driver_verification', 'dispute_raised', 'dispute_resolved');

-- AlterEnum
BEGIN;
CREATE TYPE "BookingStatus_new" AS ENUM ('PENDING_DRIVER_ACCEPTANCE', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');
ALTER TABLE "HotelBooking" ALTER COLUMN "status" TYPE "BookingStatus_new" USING ("status"::text::"BookingStatus_new");
ALTER TABLE "CarBooking" ALTER COLUMN "status" TYPE "BookingStatus_new" USING ("status"::text::"BookingStatus_new");
ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
DROP TYPE "public"."BookingStatus_old";
COMMIT;

-- DropIndex
DROP INDEX "public"."CarBooking_car_id_check_in_idx";

-- AlterTable
ALTER TABLE "Car" DROP COLUMN "rate_per_day",
ADD COLUMN     "base_price_per_day" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "distance_rate_per_km" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "fuel_type" "FuelType" NOT NULL,
ADD COLUMN     "license_plate" TEXT,
ADD COLUMN     "transmission" "TransmissionType" NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "year" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CarBooking" DROP COLUMN "check_in",
DROP COLUMN "check_out",
DROP COLUMN "quantity",
ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "customer_notes" TEXT,
ADD COLUMN     "driver_earnings" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "driver_notes" TEXT,
ADD COLUMN     "dropoff_location" TEXT NOT NULL,
ADD COLUMN     "end_date" DATE NOT NULL,
ADD COLUMN     "estimated_distance" DECIMAL(10,2),
ADD COLUMN     "pickup_location" TEXT NOT NULL,
ADD COLUMN     "platform_fee" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "start_date" DATE NOT NULL,
ADD COLUMN     "started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL;

-- AlterTable
ALTER TABLE "PaymentTransaction" DROP COLUMN "stripe_charge_id",
DROP COLUMN "stripe_payment_intent_id";

-- CreateTable
CREATE TABLE "StripePaymentDetails" (
    "id" SERIAL NOT NULL,
    "payment_transaction_id" INTEGER NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "stripe_charge_id" TEXT,
    "stripe_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePaymentDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentDetails_payment_transaction_id_key" ON "StripePaymentDetails"("payment_transaction_id");

-- CreateIndex
CREATE INDEX "StripePaymentDetails_stripe_payment_intent_id_idx" ON "StripePaymentDetails"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "StripePaymentDetails_stripe_charge_id_idx" ON "StripePaymentDetails"("stripe_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_booking_id_key" ON "Chat"("booking_id");

-- CreateIndex
CREATE INDEX "Chat_booking_id_idx" ON "Chat"("booking_id");

-- CreateIndex
CREATE INDEX "ChatMessage_chat_id_sent_at_idx" ON "ChatMessage"("chat_id", "sent_at");

-- CreateIndex
CREATE INDEX "ChatMessage_sender_id_idx" ON "ChatMessage"("sender_id");

-- CreateIndex
CREATE INDEX "Car_base_price_per_day_idx" ON "Car"("base_price_per_day");

-- CreateIndex
CREATE INDEX "Car_transmission_idx" ON "Car"("transmission");

-- CreateIndex
CREATE INDEX "Car_fuel_type_idx" ON "Car"("fuel_type");

-- CreateIndex
CREATE INDEX "CarBooking_car_id_start_date_idx" ON "CarBooking"("car_id", "start_date");

-- CreateIndex
CREATE INDEX "CarBooking_start_date_end_date_idx" ON "CarBooking"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePaymentDetails" ADD CONSTRAINT "StripePaymentDetails_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "CarBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
