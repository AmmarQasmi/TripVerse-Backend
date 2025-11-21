-- AlterTable
ALTER TABLE "DriverDocument" ADD COLUMN     "public_id" TEXT;

-- CreateTable
CREATE TABLE "MonumentExportLog" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "monument_id" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonumentExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonumentExportLog_user_id_created_at_idx" ON "MonumentExportLog"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "MonumentExportLog_monument_id_idx" ON "MonumentExportLog"("monument_id");

-- CreateIndex
CREATE INDEX "DriverDocument_public_id_idx" ON "DriverDocument"("public_id");

-- AddForeignKey
ALTER TABLE "MonumentExportLog" ADD CONSTRAINT "MonumentExportLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonumentExportLog" ADD CONSTRAINT "MonumentExportLog_monument_id_fkey" FOREIGN KEY ("monument_id") REFERENCES "MonumentRecognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
