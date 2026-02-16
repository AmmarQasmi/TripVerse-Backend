/*
  Warnings:

  - You are about to drop the column `end_date` on the `generated_itineraries` table. All the data in the column will be lost.
  - You are about to drop the column `interests` on the `generated_itineraries` table. All the data in the column will be lost.
  - You are about to drop the column `itinerary_data` on the `generated_itineraries` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `generated_itineraries` table. All the data in the column will be lost.
  - Added the required column `preview_data` to the `generated_itineraries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `generated_itineraries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ItineraryStatus" AS ENUM ('preview', 'enriching', 'complete', 'failed');

-- DropForeignKey
ALTER TABLE "public"."generated_itineraries" DROP CONSTRAINT "generated_itineraries_session_id_fkey";

-- AlterTable
ALTER TABLE "generated_itineraries" DROP COLUMN "end_date",
DROP COLUMN "interests",
DROP COLUMN "itinerary_data",
DROP COLUMN "start_date",
ADD COLUMN     "duration_days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "enriched_data" JSONB,
ADD COLUMN     "preview_data" JSONB NOT NULL,
ADD COLUMN     "status" "ItineraryStatus" NOT NULL DEFAULT 'preview',
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "session_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "generated_itineraries_user_id_status_idx" ON "generated_itineraries"("user_id", "status");

-- AddForeignKey
ALTER TABLE "generated_itineraries" ADD CONSTRAINT "generated_itineraries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
