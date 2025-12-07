-- AlterTable
ALTER TABLE "HotelBooking" ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "HotelBooking_expires_at_idx" ON "HotelBooking"("expires_at");
