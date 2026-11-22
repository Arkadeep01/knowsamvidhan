-- Fix ChatMessage conversation foreign key to ON DELETE Cascade
-- Note: PostgreSQL does not support ALTER ... SET DEFAULT/DROP/... on foreign keys directly.
-- We must recreate the foreign key constraint.

-- Drop the existing RESTRICT foreign key
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'ChatMessage'
        AND constraint_name = 'ChatMessage_conversationId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_conversationId_fkey";
    END IF;
END
$$;

-- Add the new CASCADE foreign key
ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;