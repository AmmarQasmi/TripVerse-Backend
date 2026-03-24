-- CreateTable Wallet
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "userType" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "locked" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE("user_id", "userType")
);

-- CreateTable WalletTransaction
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wallet_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "metadata" JSONB,
    "booking_id" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTransaction_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable CommissionDebt
CREATE TABLE "CommissionDebt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driver_id" INTEGER NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionDebt_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE("booking_id")
);

-- CreateTable WalletTopup
CREATE TABLE "WalletTopup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wallet_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripe_payment_intent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalletTopup_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable DisputeRefund
CREATE TABLE "DisputeRefund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispute_id" INTEGER NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "refund_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DisputeRefund_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable RenewalFee
CREATE TABLE "RenewalFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driver_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "renewal_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RenewalFee_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Wallet_user_id_idx" ON "Wallet"("user_id");
CREATE INDEX "WalletTransaction_wallet_id_idx" ON "WalletTransaction"("wallet_id");
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");
CREATE INDEX "WalletTransaction_created_at_idx" ON "WalletTransaction"("created_at");
CREATE INDEX "CommissionDebt_driver_id_idx" ON "CommissionDebt"("driver_id");
CREATE INDEX "CommissionDebt_status_idx" ON "CommissionDebt"("status");
CREATE INDEX "CommissionDebt_due_date_idx" ON "CommissionDebt"("due_date");
CREATE INDEX "WalletTopup_wallet_id_idx" ON "WalletTopup"("wallet_id");
CREATE INDEX "WalletTopup_status_idx" ON "WalletTopup"("status");
CREATE INDEX "DisputeRefund_wallet_id_idx" ON "DisputeRefund"("wallet_id");
CREATE INDEX "RenewalFee_driver_id_idx" ON "RenewalFee"("driver_id");
CREATE INDEX "RenewalFee_status_idx" ON "RenewalFee"("status");
