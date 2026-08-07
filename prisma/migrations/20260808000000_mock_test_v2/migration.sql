-- AlterTable: new question types
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'MULTIPLE_SELECT';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'NUMERICAL';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'PARAGRAPH';

-- AlterTable: MockTestQuestion answer columns
ALTER TABLE "MockTestQuestion" ADD COLUMN "answerText" TEXT,
ADD COLUMN "alternatives" TEXT,
ADD COLUMN "keywords" TEXT,
ADD COLUMN "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "correctBoolean" BOOLEAN,
ADD COLUMN "correctOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: AnswerRecord
ALTER TABLE "AnswerRecord" ADD COLUMN "booleanAnswer" BOOLEAN,
ADD COLUMN "selectedOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: Result score/total to Float
ALTER TABLE "Result" ALTER COLUMN "score" SET DEFAULT 0;
ALTER TABLE "Result" ALTER COLUMN "score" TYPE DOUBLE PRECISION USING "score"::DOUBLE PRECISION;
ALTER TABLE "Result" ALTER COLUMN "total" SET DEFAULT 0;
ALTER TABLE "Result" ALTER COLUMN "total" TYPE DOUBLE PRECISION USING "total"::DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "MockTestQuestion_mockTestId_orderIndex_idx" ON "MockTestQuestion"("mockTestId", "orderIndex");

-- CreateIndex
CREATE INDEX "AnswerRecord_resultId_idx" ON "AnswerRecord"("resultId");

-- CreateIndex
CREATE INDEX "AnswerRecord_mockTestQuestionId_idx" ON "AnswerRecord"("mockTestQuestionId");

-- CreateIndex
CREATE INDEX "Result_mockTestId_idx" ON "Result"("mockTestId");

-- CreateIndex
CREATE INDEX "Result_userId_idx" ON "Result"("userId");

-- CreateIndex
CREATE INDEX "MockTest_preparationCategoryId_idx" ON "MockTest"("preparationCategoryId");

-- CreateIndex
CREATE INDEX "MockTest_publishStatus_preparationCategoryId_idx" ON "MockTest"("publishStatus", "preparationCategoryId");

-- CreateIndex
CREATE INDEX "MockTest_topicId_idx" ON "MockTest"("topicId");
