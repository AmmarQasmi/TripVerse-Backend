-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'wallet';

-- DropForeignKey
ALTER TABLE "public"."CommissionDebt" DROP CONSTRAINT "CommissionDebt_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."DisputeRefund" DROP CONSTRAINT "DisputeRefund_wallet_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."RenewalFee" DROP CONSTRAINT "RenewalFee_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Wallet" DROP CONSTRAINT "Wallet_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."WalletTopup" DROP CONSTRAINT "WalletTopup_wallet_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."WalletTransaction" DROP CONSTRAINT "WalletTransaction_wallet_id_fkey";

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionDebt" ADD CONSTRAINT "CommissionDebt_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTopup" ADD CONSTRAINT "WalletTopup_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeRefund" ADD CONSTRAINT "DisputeRefund_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalFee" ADD CONSTRAINT "RenewalFee_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
