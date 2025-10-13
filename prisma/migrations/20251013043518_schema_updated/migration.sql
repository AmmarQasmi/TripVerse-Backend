/*
  Warnings:

  - You are about to drop the column `images_json` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `make` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `Car` table. All the data in the column will be lost.
  - You are about to drop the column `attachments_json` on the `Dispute` table. All the data in the column will be lost.
  - You are about to drop the column `existing_rating` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `license_image_url` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `rating_platform` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `rating_screenshot_url` on the `Driver` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `Hotel` table. All the data in the column will be lost.
  - You are about to drop the column `images_json` on the `Hotel` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `Hotel` table. All the data in the column will be lost.
  - You are about to drop the column `payload_json` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `User` table. All the data in the column will be lost.
  - Added the required column `car_model_id` to the `Car` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city_id` to the `Hotel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `message` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city_id` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'inactive', 'banned');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('license', 'cnic', 'vehicle_registration', 'insurance', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'approved', 'rejected');

-- DropIndex
DROP INDEX "public"."Hotel_region_avg_rating_idx";

-- AlterTable
ALTER TABLE "Car" DROP COLUMN "images_json",
DROP COLUMN "make",
DROP COLUMN "model",
ADD COLUMN     "car_model_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Dispute" DROP COLUMN "attachments_json";

-- AlterTable
ALTER TABLE "Driver" DROP COLUMN "existing_rating",
DROP COLUMN "license_image_url",
DROP COLUMN "rating_platform",
DROP COLUMN "rating_screenshot_url";

-- AlterTable
ALTER TABLE "Hotel" DROP COLUMN "city",
DROP COLUMN "images_json",
DROP COLUMN "region",
ADD COLUMN     "city_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "payload_json",
ADD COLUMN     "message" TEXT NOT NULL,
ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "title" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "region",
ADD COLUMN     "city_id" INTEGER NOT NULL,
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarModel" (
    "id" SERIAL NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverRating" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "rating" DECIMAL(3,2) NOT NULL,
    "screenshot_url" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_url" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" INTEGER,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelImage" (
    "id" SERIAL NOT NULL,
    "hotel_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarImage" (
    "id" SERIAL NOT NULL,
    "car_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeAttachment" (
    "id" SERIAL NOT NULL,
    "dispute_id" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE INDEX "City_region_idx" ON "City"("region");

-- CreateIndex
CREATE UNIQUE INDEX "CarModel_make_model_key" ON "CarModel"("make", "model");

-- CreateIndex
CREATE INDEX "DriverRating_driver_id_idx" ON "DriverRating"("driver_id");

-- CreateIndex
CREATE INDEX "DriverDocument_driver_id_idx" ON "DriverDocument"("driver_id");

-- CreateIndex
CREATE INDEX "DriverDocument_status_idx" ON "DriverDocument"("status");

-- CreateIndex
CREATE INDEX "HotelImage_hotel_id_display_order_idx" ON "HotelImage"("hotel_id", "display_order");

-- CreateIndex
CREATE INDEX "CarImage_car_id_display_order_idx" ON "CarImage"("car_id", "display_order");

-- CreateIndex
CREATE INDEX "DisputeAttachment_dispute_id_idx" ON "DisputeAttachment"("dispute_id");

-- CreateIndex
CREATE INDEX "Car_car_model_id_idx" ON "Car"("car_model_id");

-- CreateIndex
CREATE INDEX "Car_is_active_idx" ON "Car"("is_active");

-- CreateIndex
CREATE INDEX "Driver_is_verified_idx" ON "Driver"("is_verified");

-- CreateIndex
CREATE INDEX "Hotel_city_id_avg_rating_idx" ON "Hotel"("city_id", "avg_rating");

-- CreateIndex
CREATE INDEX "Hotel_is_active_idx" ON "Hotel"("is_active");

-- CreateIndex
CREATE INDEX "Notification_user_id_read_at_idx" ON "Notification"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "User_city_id_idx" ON "User"("city_id");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRating" ADD CONSTRAINT "DriverRating_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelImage" ADD CONSTRAINT "HotelImage_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Car" ADD CONSTRAINT "Car_car_model_id_fkey" FOREIGN KEY ("car_model_id") REFERENCES "CarModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarImage" ADD CONSTRAINT "CarImage_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeAttachment" ADD CONSTRAINT "DisputeAttachment_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
