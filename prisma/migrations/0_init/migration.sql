-- Enable pgvector extension (required for vector(1536) column type)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('document', 'mindmap', 'quiz', 'video', 'code', 'reading', 'ppt');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "PathStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('profile_build', 'tutor', 'resource_request');

-- CreateEnum
CREATE TYPE "DtTurnStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DtMessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "DtKbStatus" AS ENUM ('initializing', 'processing', 'ready', 'error', 'needs_reindex');

-- CreateEnum
CREATE TYPE "DtDocStatus" AS ENUM ('pending', 'parsing', 'chunking', 'embedding', 'ready', 'error');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "avatar" TEXT,
    "nickname" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dimensions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sourceAgent" TEXT NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'generating',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPath" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "status" "PathStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathNodeResource" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,

    CONSTRAINT "PathNodeResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageOutline" (
    "stageId" TEXT NOT NULL,
    "outlines" JSONB NOT NULL,
    "createdAt" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StageOutline_pkey" PRIMARY KEY ("stageId")
);

-- CreateTable
CREATE TABLE "dt_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "capability" TEXT,
    "compressed_summary" TEXT,
    "summary_up_to_msg_id" INTEGER,
    "preferences" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dt_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_turns" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "capability" TEXT,
    "status" "DtTurnStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,
    "token_usage" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "dt_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_messages" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "DtMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "capability" TEXT,
    "turn_id" TEXT,
    "attachments" JSONB,
    "metadata" JSONB,
    "parent_message_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "dt_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_turn_events" (
    "id" SERIAL NOT NULL,
    "turn_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "timestamp" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "dt_turn_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dt_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_model_catalogs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "catalog" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dt_model_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_knowledge_bases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "DtKbStatus" NOT NULL DEFAULT 'initializing',
    "document_count" INTEGER NOT NULL DEFAULT 0,
    "total_chunks" INTEGER NOT NULL DEFAULT 0,
    "embedding_model" TEXT NOT NULL DEFAULT '',
    "embedding_dim" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB,
    "metadata" JSONB,
    "last_indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dt_knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_documents" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT NOT NULL DEFAULT '',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "status" "DtDocStatus" NOT NULL DEFAULT 'pending',
    "file_hash" TEXT NOT NULL DEFAULT '',
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dt_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "chunk_index" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dt_document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 4096,
    "thinking_mode" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "language" TEXT NOT NULL DEFAULT 'zh',
    "smartlearn_provider_id" TEXT,
    "smartlearn_model_id" TEXT,
    "smartlearn_base_url" TEXT,
    "generate_ppt_images" BOOLEAN NOT NULL DEFAULT false,
    "max_turns" INTEGER NOT NULL DEFAULT 40,
    "max_resource_concurrency" INTEGER NOT NULL DEFAULT 3,
    "tts_provider_id" TEXT,
    "tts_voice" TEXT,
    "tts_speed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "tts_providers_config" JSONB,
    "asr_provider_id" TEXT,
    "asr_language" TEXT,
    "asr_providers_config" JSONB,
    "selected_agent_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabled_agent_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auto_context_window" BOOLEAN NOT NULL DEFAULT true,
    "context_window_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "rate_limit_enabled" BOOLEAN NOT NULL DEFAULT true,
    "extra" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "surface" TEXT,
    "slot" TEXT,
    "kind" TEXT,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "session_id" TEXT,
    "turn_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "cover_gradient" TEXT,
    "spine" JSONB,
    "pages" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cowriter_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "last_edited" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cowriter_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "agent_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resource_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LearningProfile_userId_idx" ON "LearningProfile"("userId");

-- CreateIndex
CREATE INDEX "Resource_userId_type_idx" ON "Resource"("userId", "type");

-- CreateIndex
CREATE INDEX "Resource_userId_status_idx" ON "Resource"("userId", "status");

-- CreateIndex
CREATE INDEX "LearningPath_userId_idx" ON "LearningPath"("userId");

-- CreateIndex
CREATE INDEX "QuizResult_userId_idx" ON "QuizResult"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PathNodeResource_pathId_nodeId_resourceId_key" ON "PathNodeResource"("pathId", "nodeId", "resourceId");

-- CreateIndex
CREATE INDEX "dt_sessions_userId_idx" ON "dt_sessions"("userId");

-- CreateIndex
CREATE INDEX "dt_sessions_userId_created_at_idx" ON "dt_sessions"("userId", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dt_turns_session_id_idx" ON "dt_turns"("session_id");

-- CreateIndex
CREATE INDEX "dt_turns_session_id_status_idx" ON "dt_turns"("session_id", "status");

-- CreateIndex
CREATE INDEX "dt_messages_session_id_idx" ON "dt_messages"("session_id");

-- CreateIndex
CREATE INDEX "dt_messages_session_id_created_at_idx" ON "dt_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "dt_messages_user_id_idx" ON "dt_messages"("user_id");

-- CreateIndex
CREATE INDEX "dt_turn_events_turn_id_idx" ON "dt_turn_events"("turn_id");

-- CreateIndex
CREATE INDEX "dt_turn_events_turn_id_seq_idx" ON "dt_turn_events"("turn_id", "seq");

-- CreateIndex
CREATE INDEX "dt_api_keys_user_id_idx" ON "dt_api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dt_api_keys_user_id_provider_key" ON "dt_api_keys"("user_id", "provider");

-- CreateIndex
CREATE INDEX "dt_model_catalogs_user_id_idx" ON "dt_model_catalogs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dt_model_catalogs_user_id_service_key" ON "dt_model_catalogs"("user_id", "service");

-- CreateIndex
CREATE INDEX "dt_knowledge_bases_user_id_idx" ON "dt_knowledge_bases"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dt_knowledge_bases_user_id_name_key" ON "dt_knowledge_bases"("user_id", "name");

-- CreateIndex
CREATE INDEX "dt_documents_kb_id_idx" ON "dt_documents"("kb_id");

-- CreateIndex
CREATE INDEX "dt_document_chunks_document_id_idx" ON "dt_document_chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "memory_entries_user_id_layer_idx" ON "memory_entries"("user_id", "layer");

-- CreateIndex
CREATE INDEX "memory_entries_user_id_layer_surface_idx" ON "memory_entries"("user_id", "layer", "surface");

-- CreateIndex
CREATE INDEX "books_user_id_idx" ON "books"("user_id");

-- CreateIndex
CREATE INDEX "books_user_id_status_idx" ON "books"("user_id", "status");

-- CreateIndex
CREATE INDEX "cowriter_documents_user_id_idx" ON "cowriter_documents"("user_id");

-- CreateIndex
CREATE INDEX "cowriter_documents_user_id_status_idx" ON "cowriter_documents"("user_id", "status");

-- CreateIndex
CREATE INDEX "agent_activities_user_id_session_id_idx" ON "agent_activities"("user_id", "session_id");

-- AddForeignKey
ALTER TABLE "LearningProfile" ADD CONSTRAINT "LearningProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPath" ADD CONSTRAINT "LearningPath_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathNodeResource" ADD CONSTRAINT "PathNodeResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_sessions" ADD CONSTRAINT "dt_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_turns" ADD CONSTRAINT "dt_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "dt_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_messages" ADD CONSTRAINT "dt_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_messages" ADD CONSTRAINT "dt_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "dt_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_messages" ADD CONSTRAINT "dt_messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "dt_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_turn_events" ADD CONSTRAINT "dt_turn_events_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "dt_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_api_keys" ADD CONSTRAINT "dt_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_knowledge_bases" ADD CONSTRAINT "dt_knowledge_bases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_documents" ADD CONSTRAINT "dt_documents_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "dt_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_document_chunks" ADD CONSTRAINT "dt_document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "dt_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowriter_documents" ADD CONSTRAINT "cowriter_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
