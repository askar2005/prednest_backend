-- CreateEnum migration for DailyChallengeStatus: ACTIVE -> PUBLISHED (data-safe)
-- Rows with status 'ACTIVE' are remapped to 'PUBLISHED' during the type cast.
BEGIN;
CREATE TYPE "DailyChallengeStatus_new" AS ENUM ('QUEUE', 'PUBLISHED', 'ARCHIVED');
ALTER TABLE "DailyChallenge" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DailyChallenge" ALTER COLUMN "status" TYPE "DailyChallengeStatus_new" USING (CASE WHEN "status"::text = 'ACTIVE' THEN 'PUBLISHED' ELSE "status"::text END)::"DailyChallengeStatus_new";
ALTER TYPE "DailyChallengeStatus" RENAME TO "DailyChallengeStatus_old";
ALTER TYPE "DailyChallengeStatus_new" RENAME TO "DailyChallengeStatus";
DROP TYPE "DailyChallengeStatus_old";
ALTER TABLE "DailyChallenge" ALTER COLUMN "status" SET DEFAULT 'QUEUE';
COMMIT;

-- AlterTable
ALTER TABLE "DailyChallenge" ADD COLUMN "description" TEXT,
ADD COLUMN "difficulty" "DifficultyLevel",
ADD COLUMN "publishedDate" TIMESTAMP(3),
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "topic" TEXT,
ALTER COLUMN "correctAnswer" SET DEFAULT 'A';