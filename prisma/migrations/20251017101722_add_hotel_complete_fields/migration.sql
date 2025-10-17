/*
  Warnings:

  - You are about to drop the `Hotel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HotelImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HotelRoomType` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Hotel" DROP CONSTRAINT "Hotel_city_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."HotelBooking" DROP CONSTRAINT "HotelBooking_hotel_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."HotelBooking" DROP CONSTRAINT "HotelBooking_room_type_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."HotelImage" DROP CONSTRAINT "HotelImage_hotel_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."HotelRoomType" DROP CONSTRAINT "HotelRoomType_hotel_id_fkey";

-- DropTable
DROP TABLE "public"."Hotel";

-- DropTable
DROP TABLE "public"."HotelImage";

-- DropTable
DROP TABLE "public"."HotelRoomType";

-- CreateTable
CREATE TABLE "hotels" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city_id" INTEGER NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "star_rating" INTEGER DEFAULT 4,
    "amenities" JSONB DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_images" (
    "id" SERIAL NOT NULL,
    "hotel_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_room_types" (
    "id" SERIAL NOT NULL,
    "hotel_id" INTEGER NOT NULL,
    "name" "RoomTypeName" NOT NULL,
    "description" TEXT,
    "max_occupancy" INTEGER NOT NULL,
    "total_rooms" INTEGER NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "amenities" JSONB DEFAULT '[]',
    "images" JSONB DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_room_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotels_city_id_star_rating_idx" ON "hotels"("city_id", "star_rating");

-- CreateIndex
CREATE INDEX "hotels_is_active_idx" ON "hotels"("is_active");

-- CreateIndex
CREATE INDEX "hotels_star_rating_idx" ON "hotels"("star_rating");

-- CreateIndex
CREATE INDEX "hotels_created_at_idx" ON "hotels"("created_at");

-- CreateIndex
CREATE INDEX "hotel_images_hotel_id_display_order_idx" ON "hotel_images"("hotel_id", "display_order");

-- CreateIndex
CREATE INDEX "hotel_room_types_hotel_id_idx" ON "hotel_room_types"("hotel_id");

-- CreateIndex
CREATE INDEX "hotel_room_types_hotel_id_name_idx" ON "hotel_room_types"("hotel_id", "name");

-- CreateIndex
CREATE INDEX "hotel_room_types_base_price_idx" ON "hotel_room_types"("base_price");

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_images" ADD CONSTRAINT "hotel_images_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "hotel_room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
