-- Discussion feature: per-topic threads + comments/replies
CREATE TABLE "DiscussionThread" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionComment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT,
    "adminId" TEXT,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscussionThread_topicId_key" ON "DiscussionThread"("topicId");

CREATE INDEX "DiscussionComment_threadId_createdAt_idx" ON "DiscussionComment"("threadId", "createdAt");
CREATE INDEX "DiscussionComment_parentId_idx" ON "DiscussionComment"("parentId");

ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
