PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE "Criteria_new" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "payload" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '未命名评分标准',
  "classId" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "creatorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Criteria_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Criteria_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Criteria_new" (
  "key", "payload", "name", "classId", "visibility", "creatorId", "createdAt", "updatedAt"
)
SELECT
  c."key",
  c."payload",
  '未命名评分标准',
  u."classId",
  'private',
  c."creatorId",
  c."createdAt",
  c."updatedAt"
FROM "Criteria" c
LEFT JOIN "User" u ON u."id" = c."creatorId";

DROP TABLE "Criteria";
ALTER TABLE "Criteria_new" RENAME TO "Criteria";

CREATE INDEX "Criteria_creatorId_idx" ON "Criteria"("creatorId");
CREATE INDEX "Criteria_classId_visibility_idx" ON "Criteria"("classId", "visibility");

COMMIT;

PRAGMA foreign_keys = ON;
