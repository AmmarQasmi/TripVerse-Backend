-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "existing_rating" DECIMAL(3,2),
ADD COLUMN     "license_image_url" TEXT,
ADD COLUMN     "rating_platform" TEXT,
ADD COLUMN     "rating_screenshot_url" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verification_notes" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3);
