-- AddMetadata column to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "metadata" JSONB;

-- Add index for metadata queries (optional, for JSONB containment queries)
CREATE INDEX "ChatMessage_metadata_idx" ON "ChatMessage" USING GIN ("metadata");