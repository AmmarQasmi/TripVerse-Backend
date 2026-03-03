-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('online', 'cash');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('RENTAL', 'RIDE_HAILING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DisputeCategory" ADD VALUE 'harassment';
ALTER TYPE "DisputeCategory" ADD VALUE 'rash_driving';
ALTER TYPE "DisputeCategory" ADD VALUE 'verbal_abuse';

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "available_for_rental" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "available_for_ride_hailing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "base_fare" DECIMAL(10,2),
ADD COLUMN     "current_mode" TEXT DEFAULT 'offline',
ADD COLUMN     "minimum_fare" DECIMAL(10,2),
ADD COLUMN     "per_km_rate" DECIMAL(10,2),
ADD COLUMN     "per_minute_rate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "CarBooking" ADD COLUMN     "base_fare" DECIMAL(10,2),
ADD COLUMN     "booking_type" "BookingType" NOT NULL DEFAULT 'RENTAL',
ADD COLUMN     "cash_collected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dropoff_city_id" INTEGER,
ADD COLUMN     "estimated_duration" INTEGER,
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'online',
ADD COLUMN     "pickup_city_id" INTEGER,
ADD COLUMN     "scheduled_pickup" TIMESTAMP(3),
ADD COLUMN     "surge_multiplier" DECIMAL(3,2) DEFAULT 1.0,
ALTER COLUMN "end_date" DROP NOT NULL,
ALTER COLUMN "start_date" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "extra_categories" "DisputeCategory"[] DEFAULT ARRAY[]::"DisputeCategory"[],
ADD COLUMN     "fine_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'online';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "wallet_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Car_available_for_rental_idx" ON "Car"("available_for_rental");

-- CreateIndex
CREATE INDEX "Car_available_for_ride_hailing_idx" ON "Car"("available_for_ride_hailing");

-- CreateIndex
CREATE INDEX "CarBooking_booking_type_status_idx" ON "CarBooking"("booking_type", "status");

-- CreateIndex
CREATE INDEX "CarBooking_pickup_city_id_idx" ON "CarBooking"("pickup_city_id");

-- CreateIndex
CREATE INDEX "CarBooking_scheduled_pickup_idx" ON "CarBooking"("scheduled_pickup");

-- AddForeignKey
ALTER TABLE "CarBooking" ADD CONSTRAINT "CarBooking_dropoff_city_id_fkey" FOREIGN KEY ("dropoff_city_id") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarBooking" ADD CONSTRAINT "CarBooking_pickup_city_id_fkey" FOREIGN KEY ("pickup_city_id") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
