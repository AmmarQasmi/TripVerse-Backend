-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'hotel_registration';
ALTER TYPE "DocumentType" ADD VALUE 'business_license';
ALTER TYPE "DocumentType" ADD VALUE 'tax_certificate';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'hotel_manager_verification_approved';
ALTER TYPE "NotificationType" ADD VALUE 'hotel_manager_verification_rejected';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'hotel_manager';

-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "is_listed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manager_id" INTEGER;

-- CreateTable
CREATE TABLE "HotelManager" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "stripe_account_id" TEXT,
    "verification_notes" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelManagerDocument" (
    "id" SERIAL NOT NULL,
    "hotel_manager_id" INTEGER NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_url" TEXT NOT NULL,
    "public_id" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" INTEGER,

    CONSTRAINT "HotelManagerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelManager_user_id_key" ON "HotelManager"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "HotelManager_stripe_account_id_key" ON "HotelManager"("stripe_account_id");

-- CreateIndex
CREATE INDEX "HotelManager_is_verified_idx" ON "HotelManager"("is_verified");

-- CreateIndex
CREATE INDEX "HotelManagerDocument_hotel_manager_id_idx" ON "HotelManagerDocument"("hotel_manager_id");

-- CreateIndex
CREATE INDEX "HotelManagerDocument_status_idx" ON "HotelManagerDocument"("status");

-- CreateIndex
CREATE INDEX "HotelManagerDocument_public_id_idx" ON "HotelManagerDocument"("public_id");

-- CreateIndex
CREATE INDEX "hotels_manager_id_idx" ON "hotels"("manager_id");

-- CreateIndex
CREATE INDEX "hotels_is_listed_idx" ON "hotels"("is_listed");

-- AddForeignKey
ALTER TABLE "HotelManager" ADD CONSTRAINT "HotelManager_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelManagerDocument" ADD CONSTRAINT "HotelManagerDocument_hotel_manager_id_fkey" FOREIGN KEY ("hotel_manager_id") REFERENCES "HotelManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelManagerDocument" ADD CONSTRAINT "HotelManagerDocument_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "HotelManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
