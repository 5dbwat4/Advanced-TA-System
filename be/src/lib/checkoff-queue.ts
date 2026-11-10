import { compareExperimentMark } from './banks.js'
import { prisma } from './prisma.js'

/**
 * 排队验收队列的纯数据逻辑。
 *
 * 注意：本文件**不得** import `realtime.ts`（realtime 运行时反向依赖本文件，
 * 否则形成循环依赖）。广播函数 `broadcastCheckoffQueue` 放在 realtime.ts。
 */

/** 队列状态：WAITING=排队中（未被叫号）| NOTIFIED=排队中（已被叫号）| CHECKING=验收中 */
export type CheckoffQueueState = 'WAITING' | 'NOTIFIED' | 'CHECKING'

/** 把库里的 state 字符串归一化为合法状态（脏数据按 WAITING 处理，避免前端收到未知值） */
export function toCheckoffQueueState(value: string | null | undefined): CheckoffQueueState {
  return value === 'NOTIFIED' || value === 'CHECKING' ? value : 'WAITING'
}

/** 排队条目对外结构（助教端） */
export type CheckoffQueueEntryDto = {
  id: string
  userId: string
  name: string
  studentId: string
  avatar: number | null
  experimentId: string
  experimentMark: string
  experimentTitle: string
  state: CheckoffQueueState
  /** 实验内位次，1-based（按 position asc, joinedAt asc 排序后重新编号） */
  position: number
  joinedAt: string
  notifiedBy: { id: string; name: string; avatar: number | null } | null
  notifiedAt: string | null
  checkingBy: { id: string; name: string; avatar: number | null } | null
  checkingAt: string | null
}

/** 队列里引用的助教信息（notifiedBy / checkingBy 合并去重后一次查出） */
type TaBrief = { id: string; name: string; avatar: number | null }

/** 排序：先按实验 mark（compareExperimentMark），同实验内 position asc、joinedAt asc */
function compareQueueEntry(
  a: { experimentId: string; position: number; joinedAt: Date },
  b: { experimentId: string; position: number; joinedAt: Date },
  markByExperiment: Map<string, string>,
): number {
  const byMark = compareExperimentMark(
    markByExperiment.get(a.experimentId) ?? '',
    markByExperiment.get(b.experimentId) ?? '',
  )
  if (byMark !== 0) return byMark
  if (a.experimentId !== b.experimentId) {
    return a.experimentId.localeCompare(b.experimentId)
  }
  if (a.position !== b.position) return a.position - b.position
  return a.joinedAt.getTime() - b.joinedAt.getTime()
}

/**
 * 读取某班级全部排队条目。
 * 学生 / 实验 / 相关助教各用一次批量查询补齐（共 4 次查询，无 N+1），
 * 过滤掉已删除的学生或实验；位次为实验内 1-based 序号。
 */
export async function loadCheckoffQueue(classId: string): Promise<CheckoffQueueEntryDto[]> {
  const entries = await prisma.checkoffQueueEntry.findMany({
    where: { classId },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
  })
  if (entries.length === 0) return []

  const userIds = [...new Set(entries.map((entry) => entry.userId))]
  const experimentIds = [...new Set(entries.map((entry) => entry.experimentId))]
  const taIds = [
    ...new Set(
      entries
        .flatMap((entry) => [entry.notifiedBy, entry.checkingBy])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]

  const [users, experiments, tas] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, studentId: true, avatar: true },
    }),
    prisma.experiment.findMany({
      where: { id: { in: experimentIds } },
      select: { id: true, mark: true, title: true },
    }),
    taIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: taIds } },
          select: { id: true, name: true, avatar: true },
        })
      : Promise.resolve<TaBrief[]>([]),
  ])

  const userById = new Map(users.map((user) => [user.id, user]))
  const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]))
  const taById = new Map(tas.map((ta) => [ta.id, ta]))
  const markByExperiment = new Map(experiments.map((experiment) => [experiment.id, experiment.mark]))

  const sorted = [...entries].sort((a, b) => compareQueueEntry(a, b, markByExperiment))

  const result: CheckoffQueueEntryDto[] = []
  // experimentId → 已分配的位次；按 mark 分组连续输出，组内从 1 开始重新编号
  const positionByExperiment = new Map<string, number>()
  for (const entry of sorted) {
    const user = userById.get(entry.userId)
    const experiment = experimentById.get(entry.experimentId)
    if (!user || !experiment) continue
    const position = (positionByExperiment.get(entry.experimentId) ?? 0) + 1
    positionByExperiment.set(entry.experimentId, position)
    const notifiedBy = entry.notifiedBy ? taById.get(entry.notifiedBy) : undefined
    const checkingBy = entry.checkingBy ? taById.get(entry.checkingBy) : undefined
    result.push({
      id: entry.id,
      userId: entry.userId,
      name: user.name,
      studentId: user.studentId ?? '',
      avatar: user.avatar,
      experimentId: entry.experimentId,
      experimentMark: experiment.mark,
      experimentTitle: experiment.title,
      state: toCheckoffQueueState(entry.state),
      position,
      joinedAt: entry.joinedAt.toISOString(),
      notifiedBy: notifiedBy
        ? { id: notifiedBy.id, name: notifiedBy.name, avatar: notifiedBy.avatar }
        : null,
      notifiedAt: entry.notifiedAt?.toISOString() ?? null,
      checkingBy: checkingBy
        ? { id: checkingBy.id, name: checkingBy.name, avatar: checkingBy.avatar }
        : null,
      checkingAt: entry.checkingAt?.toISOString() ?? null,
    })
  }
  return result
}

/** 删除某学生某实验的排队记录，返回删除条数 */
export async function removeCheckoffQueueEntry(
  experimentId: string,
  userId: string,
): Promise<number> {
  const { count } = await prisma.checkoffQueueEntry.deleteMany({ where: { experimentId, userId } })
  return count
}

/** 追加到队尾（position = 该实验现有最大 position + 1）；已存在返回 false 且不改变原记录 */
export async function insertCheckoffQueueEntry(params: {
  classId: string
  experimentId: string
  userId: string
}): Promise<boolean> {
  const { classId, experimentId, userId } = params
  const existing = await prisma.checkoffQueueEntry.findUnique({
    where: { experimentId_userId: { experimentId, userId } },
    select: { id: true },
  })
  if (existing) return false

  const last = await prisma.checkoffQueueEntry.findFirst({
    where: { experimentId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  await prisma.checkoffQueueEntry.create({
    data: {
      classId,
      experimentId,
      userId,
      state: 'WAITING',
      position: (last?.position ?? -1) + 1,
    },
  })
  return true
}

/** 重排：entryIds 必须是该实验全部条目（顺序即新顺序）；用事务写入 position 0..n-1；返回更新条数 */
export async function reorderCheckoffQueue(
  experimentId: string,
  entryIds: string[],
): Promise<number> {
  if (entryIds.length === 0) return 0
  const results = await prisma.$transaction(
    entryIds.map((id, index) =>
      prisma.checkoffQueueEntry.updateMany({
        where: { id, experimentId },
        data: { position: index },
      }),
    ),
  )
  return results.reduce((total, result) => total + result.count, 0)
}

/**
 * 叫号：state=NOTIFIED, notifiedBy=该助教, notifiedAt=now。
 * 若条目不存在或 state 已是 CHECKING 返回 null（正在验收中不允许再叫号）。
 * `taUserId` 为叫号助教（用于前端显示「已叫号 · 助教名」）。
 */
export async function notifyCheckoffQueueEntryById(
  entryId: string,
  taUserId?: string,
): Promise<{ entry: { userId: string; experimentId: string; classId: string } } | null> {
  const current = await prisma.checkoffQueueEntry.findUnique({
    where: { id: entryId },
    select: { id: true, state: true, userId: true, experimentId: true, classId: true },
  })
  if (!current || current.state === 'CHECKING') return null

  await prisma.checkoffQueueEntry.update({
    where: { id: entryId },
    data: {
      state: 'NOTIFIED',
      notifiedBy: taUserId ?? null,
      notifiedAt: new Date(),
    },
  })
  return {
    entry: {
      userId: current.userId,
      experimentId: current.experimentId,
      classId: current.classId,
    },
  }
}

/** 撤回叫号：state=WAITING, 清空 notifiedBy/notifiedAt；若 CHECKING（或条目不存在）返回 false */
export async function cancelCheckoffQueueNotifyById(entryId: string): Promise<boolean> {
  const { count } = await prisma.checkoffQueueEntry.updateMany({
    where: { id: entryId, state: { not: 'CHECKING' } },
    data: { state: 'WAITING', notifiedBy: null, notifiedAt: null },
  })
  return count > 0
}

/** 候选排队条目（状态解析用） */
type QueueEntryCandidate = {
  id: string
  experimentId: string
  state: string
  notifiedBy: string | null
}

/**
 * 解析「该学生」的排队条目（按 spec 顺序）：
 * 1) experimentId + studentId 精确匹配；
 * 2) 有 studentId 且该学生在本班只有一条排队记录 → 用它；
 * 3) 否则按 studentName 在本班队列内唯一匹配（重名则不改）；
 * 4) 都匹配不到 → null（不改状态，只保留 presence 行为）。
 */
async function resolveCheckoffQueueEntry(params: {
  classId: string
  experimentId?: string
  studentId?: string
  studentName?: string
}): Promise<QueueEntryCandidate | null> {
  const { classId, experimentId, studentId, studentName } = params
  const select = { id: true, experimentId: true, state: true, notifiedBy: true } as const

  if (experimentId && studentId) {
    const exact = await prisma.checkoffQueueEntry.findUnique({
      where: { experimentId_userId: { experimentId, userId: studentId } },
      select: { ...select, classId: true },
    })
    if (exact) {
      if (exact.classId !== classId) return null
      return { id: exact.id, experimentId: exact.experimentId, state: exact.state, notifiedBy: exact.notifiedBy }
    }
  }

  if (studentId) {
    const mine = await prisma.checkoffQueueEntry.findMany({
      where: { classId, userId: studentId },
      select,
    })
    if (mine.length === 1) return mine[0] ?? null
    // 多条排队记录时继续走姓名匹配（姓名指向同一学生，通常同样不唯一 → 不改状态）
  }

  const name = (studentName ?? '').trim()
  if (!name) return null
  const students = await prisma.user.findMany({
    where: { classId, role: 'STUDENT', name },
    select: { id: true },
  })
  if (students.length === 0) return null
  const entries = await prisma.checkoffQueueEntry.findMany({
    where: { classId, userId: { in: students.map((student) => student.id) } },
    select,
  })
  // 重名 / 未排队 → 不唯一，不改状态
  return entries.length === 1 ? (entries[0] ?? null) : null
}

/** 进入验收：把该学生该实验的排队记录置为 CHECKING（checkingBy=taUserId, checkingAt=now），返回是否有变化 */
export async function markCheckoffQueueChecking(params: {
  classId: string
  taUserId: string
  /** 优先按 (experimentId, studentId) 精确匹配；没有 experimentId 时按 studentId 在本班唯一匹配 */
  experimentId?: string
  studentId?: string
  /** 老客户端兜底：按学生姓名在本班队列内唯一匹配 */
  studentName?: string
}): Promise<boolean> {
  const entry = await resolveCheckoffQueueEntry(params)
  if (!entry) return false
  // 已经由同一位助教验收中则视为无变化（避免重复广播）
  const { count } = await prisma.checkoffQueueEntry.updateMany({
    where: {
      id: entry.id,
      OR: [{ state: { not: 'CHECKING' } }, { checkingBy: { not: params.taUserId } }],
    },
    data: {
      state: 'CHECKING',
      checkingBy: params.taUserId,
      checkingAt: new Date(),
    },
  })
  return count > 0
}

/**
 * 离开验收 / 断开：把该助教正在验收的记录恢复为 NOTIFIED（有叫号人）或 WAITING，
 * 返回恢复条数。`studentId` 只恢复该学生，不传则恢复该助教在该班的全部 CHECKING。
 */
export async function clearCheckoffQueueChecking(params: {
  classId: string
  taUserId: string
  studentId?: string
}): Promise<number> {
  const rows = await prisma.checkoffQueueEntry.findMany({
    where: {
      classId: params.classId,
      checkingBy: params.taUserId,
      ...(params.studentId ? { userId: params.studentId } : {}),
    },
    select: { id: true, notifiedBy: true },
  })
  if (rows.length === 0) return 0

  const notifiedIds = rows.filter((row) => row.notifiedBy).map((row) => row.id)
  const waitingIds = rows.filter((row) => !row.notifiedBy).map((row) => row.id)

  let count = 0
  if (notifiedIds.length > 0) {
    const updated = await prisma.checkoffQueueEntry.updateMany({
      where: { id: { in: notifiedIds } },
      data: { state: 'NOTIFIED', checkingBy: null, checkingAt: null },
    })
    count += updated.count
  }
  if (waitingIds.length > 0) {
    const updated = await prisma.checkoffQueueEntry.updateMany({
      where: { id: { in: waitingIds } },
      data: { state: 'WAITING', checkingBy: null, checkingAt: null },
    })
    count += updated.count
  }
  return count
}

/** 该助教在本班「已叫号但尚未验收」的人数（可排除某学生） */
export async function countQueuePendingNotified(params: {
  classId: string
  taUserId: string
  excludeUserId?: string
}): Promise<number> {
  return prisma.checkoffQueueEntry.count({
    where: {
      classId: params.classId,
      notifiedBy: params.taUserId,
      state: 'NOTIFIED',
      ...(params.excludeUserId ? { userId: { not: params.excludeUserId } } : {}),
    },
  })
}

/** 该助教在本班是否正在验收（存在 CHECKING 且 checkingBy=该助教） */
export async function isTaCheckingAny(classId: string, taUserId: string): Promise<boolean> {
  const found = await prisma.checkoffQueueEntry.findFirst({
    where: { classId, checkingBy: taUserId, state: 'CHECKING' },
    select: { id: true },
  })
  return found !== null
}
