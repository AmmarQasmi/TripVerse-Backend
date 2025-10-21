-- AlterTable
ALTER TABLE "CarImage" ADD COLUMN     "public_id" TEXT;

-- AlterTable
ALTER TABLE "hotel_images" ADD COLUMN     "public_id" TEXT;

-- CreateIndex
CREATE INDEX "CarImage_public_id_idx" ON "CarImage"("public_id");

-- CreateIndex
CREATE INDEX "hotel_images_public_id_idx" ON "hotel_images"("public_id");
