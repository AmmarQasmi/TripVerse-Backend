-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'driver_review_received';

-- CreateTable
CREATE TABLE "driver_reviews" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_reviews_booking_id_key" ON "driver_reviews"("booking_id");

-- CreateIndex
CREATE INDEX "driver_reviews_driver_id_created_at_idx" ON "driver_reviews"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "driver_reviews_user_id_idx" ON "driver_reviews"("user_id");

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "CarBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
