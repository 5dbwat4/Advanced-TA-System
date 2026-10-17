-- Student -> User 统一迁移（SQLite，一次性执行）
-- 原则：User.id = 原 Student.stuId，外键值不变，仅改列名/指向。
-- 执行前请备份；生产需确认每个 staff 在 _ClassToUser 中恰好 1 个班。
-- 用法：sqlite3 dev.db ".read prisma/migrate-unify-students.sql"

PRAGMA foreign_keys=OFF;
BEGIN;

-- 1. 新 User 表：单班 + 软删除字段
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "studentId" TEXT,
    "username" TEXT,
    "avatar" INTEGER,
    "password" TEXT,
    "webauthn" TEXT,
    "zjuamAccount" TEXT,
    "zjuamPassword" TEXT,
    "zjuPersonId" INTEGER,
    "zjuSyncedAt" DATETIME,
    "preferences" TEXT,
    "classId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "removedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2. 保留原 staff（生产每人恰好 1 个班）
INSERT INTO "new_User" (
    "id", "name", "role", "studentId", "username", "avatar", "password",
    "webauthn", "zjuamAccount", "zjuamPassword", "zjuPersonId", "zjuSyncedAt",
    "preferences", "classId", "status", "removedAt", "createdAt", "updatedAt"
)
SELECT
    u."id", u."name", u."role", u."studentId", u."username", u."avatar", u."password",
    u."webauthn", u."zjuamAccount", u."zjuamPassword", u."zjuPersonId", u."zjuSyncedAt",
    u."preferences",
    (SELECT cu."A" FROM "_ClassToUser" cu WHERE cu."B" = u."id" LIMIT 1),
    'ACTIVE', NULL, u."createdAt", u."updatedAt"
FROM "User" u;

-- 3. Student -> User（id 沿用 stuId）
INSERT INTO "new_User" (
    "id", "name", "role", "studentId", "username", "avatar", "password",
    "webauthn", "zjuamAccount", "zjuamPassword", "zjuPersonId", "zjuSyncedAt",
    "preferences", "classId", "status", "removedAt", "createdAt", "updatedAt"
)
SELECT
    s."stuId", s."name", 'STUDENT', s."studentNo", NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL,
    NULL, s."classId", 'ACTIVE', NULL, s."createdAt", s."updatedAt"
FROM "Student" s;

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE INDEX "User_classId_idx" ON "User"("classId");
CREATE INDEX "User_studentId_idx" ON "User"("studentId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE UNIQUE INDEX "User_studentId_classId_key" ON "User"("studentId", "classId");
CREATE UNIQUE INDEX "User_username_classId_key" ON "User"("username", "classId");

-- 4. Score: stuId -> userId
CREATE TABLE "new_Score" (
    "userId" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "indId" TEXT NOT NULL,
    "labId" TEXT,
    "score" REAL NOT NULL,
    "graderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "type", "indId"),
    CONSTRAINT "Score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Score_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Score_graderId_fkey" FOREIGN KEY ("graderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Score" ("userId", "type", "indId", "labId", "score", "graderId", "createdAt", "updatedAt")
SELECT "stuId", "type", "indId", "labId", "score", "graderId", "createdAt", "updatedAt" FROM "Score";
DROP TABLE "Score";
ALTER TABLE "new_Score" RENAME TO "Score";
CREATE INDEX "Score_labId_idx" ON "Score"("labId");
CREATE INDEX "Score_graderId_idx" ON "Score"("graderId");

-- 5. CheckpointClaimed: stuId -> userId
CREATE TABLE "new_CheckpointClaimed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appliedRules" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CheckpointClaimed_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CheckpointClaimed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CheckpointClaimed" ("id", "classId", "userId", "appliedRules", "createdAt", "updatedAt")
SELECT "id", "classId", "stuId", "appliedRules", "createdAt", "updatedAt" FROM "CheckpointClaimed";
DROP TABLE "CheckpointClaimed";
ALTER TABLE "new_CheckpointClaimed" RENAME TO "CheckpointClaimed";
CREATE INDEX "CheckpointClaimed_classId_idx" ON "CheckpointClaimed"("classId");
CREATE INDEX "CheckpointClaimed_userId_idx" ON "CheckpointClaimed"("userId");
CREATE UNIQUE INDEX "CheckpointClaimed_classId_userId_key" ON "CheckpointClaimed"("classId", "userId");

-- 6. FocusStudent: stuId -> userId
CREATE TABLE "new_FocusStudent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FocusStudent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FocusStudent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FocusStudent" ("id", "classId", "userId", "reason", "createdAt", "updatedAt")
SELECT "id", "classId", "stuId", "reason", "createdAt", "updatedAt" FROM "FocusStudent";
DROP TABLE "FocusStudent";
ALTER TABLE "new_FocusStudent" RENAME TO "FocusStudent";
CREATE INDEX "FocusStudent_classId_idx" ON "FocusStudent"("classId");
CREATE INDEX "FocusStudent_userId_idx" ON "FocusStudent"("userId");
CREATE UNIQUE INDEX "FocusStudent_classId_userId_key" ON "FocusStudent"("classId", "userId");

-- 7. ReportReview: stuId -> userId
CREATE TABLE "new_ReportReview" (
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleContent" TEXT NOT NULL,
    "remarkById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "experimentId"),
    CONSTRAINT "ReportReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportReview_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportReview_remarkById_fkey" FOREIGN KEY ("remarkById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReportReview" ("userId", "experimentId", "ruleId", "ruleContent", "remarkById", "createdAt", "updatedAt")
SELECT "stuId", "experimentId", "ruleId", "ruleContent", "remarkById", "createdAt", "updatedAt" FROM "ReportReview";
DROP TABLE "ReportReview";
ALTER TABLE "new_ReportReview" RENAME TO "ReportReview";
CREATE INDEX "ReportReview_experimentId_idx" ON "ReportReview"("experimentId");
CREATE INDEX "ReportReview_ruleId_idx" ON "ReportReview"("ruleId");
CREATE INDEX "ReportReview_remarkById_idx" ON "ReportReview"("remarkById");

-- 8. Remark: stuId -> userId
CREATE TABLE "new_Remark" (
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "experimentId", "type"),
    CONSTRAINT "Remark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Remark_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Remark_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Remark" ("userId", "experimentId", "type", "text", "updatedById", "createdAt", "updatedAt")
SELECT "stuId", "experimentId", "type", "text", "updatedById", "createdAt", "updatedAt" FROM "Remark";
DROP TABLE "Remark";
ALTER TABLE "new_Remark" RENAME TO "Remark";
CREATE INDEX "Remark_experimentId_type_idx" ON "Remark"("experimentId", "type");
CREATE INDEX "Remark_updatedById_idx" ON "Remark"("updatedById");

-- 9. DevBoard: stuIds -> userIds
CREATE TABLE "new_DevBoard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "dbId" TEXT NOT NULL,
    "boardId" TEXT,
    "userIds" TEXT NOT NULL DEFAULT '[]',
    "phone" TEXT,
    "borrowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DevBoard_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DevBoard" ("id", "classId", "dbId", "boardId", "userIds", "phone", "borrowed", "createdAt", "updatedAt")
SELECT "id", "classId", "dbId", "boardId", "stuIds", "phone", "borrowed", "createdAt", "updatedAt" FROM "DevBoard";
DROP TABLE "DevBoard";
ALTER TABLE "new_DevBoard" RENAME TO "DevBoard";
CREATE UNIQUE INDEX "DevBoard_classId_dbId_key" ON "DevBoard"("classId", "dbId");

-- 10. 删除旧结构
DROP TABLE "_ClassToUser";
DROP TABLE "Student";

COMMIT;
PRAGMA foreign_keys=ON;
