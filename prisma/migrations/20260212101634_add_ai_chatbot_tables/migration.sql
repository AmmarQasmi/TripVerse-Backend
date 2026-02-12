-- CreateEnum
CREATE TYPE "AiAgentType" AS ENUM ('ITINERARY_GENERATOR', 'PERSONAL_ASSISTANT');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "AiSessionStatus" AS ENUM ('active', 'completed', 'expired');

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "agent_type" "AiAgentType" NOT NULL,
    "status" "AiSessionStatus" NOT NULL DEFAULT 'active',
    "current_state" TEXT NOT NULL DEFAULT 'init',
    "slots" JSONB DEFAULT '{}',
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_itineraries" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "travel_style" TEXT,
    "budget" TEXT,
    "interests" JSONB DEFAULT '[]',
    "start_date" DATE,
    "end_date" DATE,
    "itinerary_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_chat_sessions_user_id_agent_type_idx" ON "ai_chat_sessions"("user_id", "agent_type");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_user_id_status_idx" ON "ai_chat_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_status_idx" ON "ai_chat_sessions"("status");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_created_at_idx" ON "ai_chat_sessions"("created_at");

-- CreateIndex
CREATE INDEX "ai_chat_messages_session_id_created_at_idx" ON "ai_chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "generated_itineraries_session_id_key" ON "generated_itineraries"("session_id");

-- CreateIndex
CREATE INDEX "generated_itineraries_user_id_created_at_idx" ON "generated_itineraries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "generated_itineraries_destination_idx" ON "generated_itineraries"("destination");

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_itineraries" ADD CONSTRAINT "generated_itineraries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_itineraries" ADD CONSTRAINT "generated_itineraries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
