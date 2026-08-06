-- Add topicId and isPublished to PreviousYearQuestion
ALTER TABLE "PreviousYearQuestion" ADD COLUMN "topicId" TEXT;
ALTER TABLE "PreviousYearQuestion" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "PreviousYearQuestion_topicId_idx" ON "PreviousYearQuestion"("topicId");
ALTER TABLE "PreviousYearQuestion" ADD CONSTRAINT "PreviousYearQuestion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
