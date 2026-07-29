-- Add the unified current-profile fields to the existing profile table.
ALTER TABLE "LearningProfile"
  ADD COLUMN IF NOT EXISTS "last_source" TEXT,
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "LearningProfile_userId_key"
  ON "LearningProfile"("userId");

CREATE TABLE IF NOT EXISTS "learning_skill_mastery" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "mastery" DOUBLE PRECISION NOT NULL,
  "last_reviewed_at" TIMESTAMP(3),
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "streak" INTEGER NOT NULL DEFAULT 0,
  "next_review_at" TIMESTAMP(3),
  "difficulty" DOUBLE PRECISION,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_skill_mastery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "learning_skill_mastery_user_id_topic_key"
  ON "learning_skill_mastery"("user_id", "topic");
CREATE INDEX IF NOT EXISTS "learning_skill_mastery_user_id_idx"
  ON "learning_skill_mastery"("user_id");
CREATE INDEX IF NOT EXISTS "learning_skill_mastery_user_id_next_review_at_idx"
  ON "learning_skill_mastery"("user_id", "next_review_at");

CREATE TABLE IF NOT EXISTS "learning_mastery_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "topics" JSONB NOT NULL,
  "evaluation" JSONB,
  "metadata" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_mastery_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "learning_mastery_sessions_user_id_idx"
  ON "learning_mastery_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "learning_mastery_sessions_user_id_started_at_idx"
  ON "learning_mastery_sessions"("user_id", "started_at" DESC);

CREATE TABLE IF NOT EXISTS "learning_quiz_attempts" (
  "id" TEXT NOT NULL,
  "mastery_session_id" TEXT,
  "user_id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "user_answer" TEXT,
  "correct_answer" TEXT,
  "explanation" TEXT,
  "correct" BOOLEAN NOT NULL,
  "difficulty" DOUBLE PRECISION,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "learning_quiz_attempts_user_id_idx"
  ON "learning_quiz_attempts"("user_id");
CREATE INDEX IF NOT EXISTS "learning_quiz_attempts_user_id_topic_idx"
  ON "learning_quiz_attempts"("user_id", "topic");
CREATE INDEX IF NOT EXISTS "learning_quiz_attempts_mastery_session_id_idx"
  ON "learning_quiz_attempts"("mastery_session_id");

CREATE TABLE IF NOT EXISTS "learning_schedule_entries" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_schedule_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "learning_schedule_entries_user_id_idx"
  ON "learning_schedule_entries"("user_id");
CREATE INDEX IF NOT EXISTS "learning_schedule_entries_user_id_due_at_idx"
  ON "learning_schedule_entries"("user_id", "due_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_skill_mastery_user_id_fkey') THEN
    ALTER TABLE "learning_skill_mastery"
      ADD CONSTRAINT "learning_skill_mastery_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_mastery_sessions_user_id_fkey') THEN
    ALTER TABLE "learning_mastery_sessions"
      ADD CONSTRAINT "learning_mastery_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_quiz_attempts_user_id_fkey') THEN
    ALTER TABLE "learning_quiz_attempts"
      ADD CONSTRAINT "learning_quiz_attempts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_quiz_attempts_mastery_session_id_fkey') THEN
    ALTER TABLE "learning_quiz_attempts"
      ADD CONSTRAINT "learning_quiz_attempts_mastery_session_id_fkey"
      FOREIGN KEY ("mastery_session_id") REFERENCES "learning_mastery_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_schedule_entries_user_id_fkey') THEN
    ALTER TABLE "learning_schedule_entries"
      ADD CONSTRAINT "learning_schedule_entries_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
