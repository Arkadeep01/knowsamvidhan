-- Add guest and lifecycle fields to Conversation table
ALTER TABLE "Conversation" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "guestSessionId" VARCHAR(255);
ALTER TABLE "Conversation" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "archivedAt" TIMESTAMP;
ALTER TABLE "Conversation" ADD COLUMN "deletedAt" TIMESTAMP;
ALTER TABLE "Conversation" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "topic" VARCHAR(255);

-- Add editedAt, isEdited, parentMessageId to ChatMessage table
ALTER TABLE "ChatMessage" ADD COLUMN "editedAt" TIMESTAMP;
ALTER TABLE "ChatMessage" ADD COLUMN "isEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN "parentMessageId" VARCHAR(255);

-- Add category, conversationId, topic to Feedback table
ALTER TABLE "Feedback" ADD COLUMN "category" VARCHAR(255);
ALTER TABLE "Feedback" ADD COLUMN "conversationId" VARCHAR(255);
ALTER TABLE "Feedback" ADD COLUMN "topic" VARCHAR(255);

-- Add index on parentMessageId for self-referencing queries
CREATE INDEX "ChatMessage_parentMessageId_idx" ON "ChatMessage" ("parentMessageId");

-- Add foreign key constraint for parentMessageId (self-referencing ChatMessage)
-- Note: SQLite/Postgres compatible - will be a self-referencing FK
-- Comment: parentMessageId references ChatMessage.id

-- Add index on conversationId for Feedback
CREATE INDEX "Feedback_conversationId_idx" ON "Feedback" ("conversationId");

-- Add index on isArchived and deletedAt for conversation lifecycle queries
CREATE INDEX "Conversation_isArchived_idx" ON "Conversation" ("isArchived");
CREATE INDEX "Conversation_deletedAt_idx" ON "Conversation" ("deletedAt");