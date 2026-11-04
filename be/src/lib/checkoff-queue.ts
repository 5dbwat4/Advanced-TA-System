import { prisma } from './prisma.js'
import { emitCheckoffQueue } from './realtime.js'

/** 排队条目对外结构（助教端排队面板使用） */
export type CheckoffQueueEntryDto = {
  id: string
  userId: string
  name: string
  studentId: string
  avatar: number | null
  experimentId: string
  experimentMark: string
  experimentTitle: string
  /** ISO 字符串 */
  joinedAt: string
}

/**
 * 读取某班级全部排队条目（按加入时间升序）。
 * 学生 / 实验信息各用一次批量查询补齐，过滤掉已删除的学生或实验。
 */
export async function loadCheckoffQueue(classId: string): Promise<CheckoffQueueEntryDto[]> {
  const entries = await prisma.checkoffQueueEntry.findMany({
    where: { classId },
    orderBy: [{ joinedAt: 'asc' }],
  })
  if (entries.length === 0) return []

  const userIds = [...new Set(entries.map((entry) => entry.userId))]
  const experimentIds = [...new Set(entries.map((entry) => entry.experimentId))]

  const [users, experiments] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, studentId: true, avatar: true },
    }),
    prisma.experiment.findMany({
      where: { id: { in: experimentIds } },
      select: { id: true, mark: true, title: true },
    }),
  ])
  const userById = new Map(users.map((user) => [user.id, user]))
  const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]))

  const result: CheckoffQueueEntryDto[] = []
  for (const entry of entries) {
    const user = userById.get(entry.userId)
    const experiment = experimentById.get(entry.experimentId)
    if (!user || !experiment) continue
    result.push({
      id: entry.id,
      userId: entry.userId,
      name: user.name,
      studentId: user.studentId ?? '',
      avatar: user.avatar,
      experimentId: entry.experimentId,
      experimentMark: experiment.mark,
      experimentTitle: experiment.title,
      joinedAt: entry.joinedAt.toISOString(),
    })
  }
  return result
}

/** 删除某学生某实验的排队记录，返回删除条数 */
export async function removeCheckoffQueueEntry(experimentId: string, userId: string): Promise<number> {
  const { count } = await prisma.checkoffQueueEntry.deleteMany({ where: { experimentId, userId } })
  return count
}

/** 读取快照并向该班级验收房间广播 `checkoff:queue`（无条目也广播空数组，保证前端同步清空） */
export async function broadcastCheckoffQueue(classId: string): Promise<void> {
  emitCheckoffQueue(classId, await loadCheckoffQueue(classId))
}
