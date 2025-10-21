/*
  Warnings:

  - Changed the type of `status` on the `HotelBooking` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "HotelBookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- AlterTable
ALTER TABLE "HotelBooking" DROP COLUMN "status",
ADD COLUMN     "status" "HotelBookingStatus" NOT NULL;

-- CreateIndex
CREATE INDEX "HotelBooking_status_idx" ON "HotelBooking"("status");
