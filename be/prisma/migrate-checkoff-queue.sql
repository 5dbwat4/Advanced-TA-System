ALTER TABLE "CheckoffSessions" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "CheckoffSessions" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CheckoffSessions" ADD COLUMN "queueMigratedAt" DATETIME;

CREATE TABLE "CheckoffQueueEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "taId" TEXT,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" DATETIME,
  "notifiedBy" TEXT,
  "startedAt" DATETIME,
  "checkedBy" TEXT,
  "finishedAt" DATETIME,
  "missedAt" DATETIME,
  CONSTRAINT "CheckoffQueueEntry_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "CheckoffSessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CheckoffQueueEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CheckoffQueueEntry_experimentId_fkey"
    FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CheckoffQueueEntry_taId_fkey"
    FOREIGN KEY ("taId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CheckoffQueueEntry_sessionId_userId_key"
  ON "CheckoffQueueEntry"("sessionId", "userId");
CREATE INDEX "CheckoffQueueEntry_sessionId_position_idx"
  ON "CheckoffQueueEntry"("sessionId", "position");
CREATE INDEX "CheckoffQueueEntry_userId_idx"
  ON "CheckoffQueueEntry"("userId");
CREATE INDEX "CheckoffQueueEntry_experimentId_idx"
  ON "CheckoffQueueEntry"("experimentId");
CREATE INDEX "CheckoffQueueEntry_taId_idx"
  ON "CheckoffQueueEntry"("taId");

-- Existing JSON stats are migrated lazily by be/src/lib/checkoff-queue.ts.
