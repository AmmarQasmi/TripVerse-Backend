-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "is_listed" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Car_is_listed_idx" ON "Car"("is_listed");
