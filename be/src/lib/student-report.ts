import { prisma } from './prisma'
import { parseClassSettings, resolveScoreRatio, weightedTotal } from './xzzd-push'

/** 学生某次实验的成绩、报告批阅与附言（公开预览与学生控制台共用） */
export async function buildStudentReport(userId: string, experimentId: string) {
  const [experiment, student] = await Promise.all([
    prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        klass: { select: { id: true, name: true } },
        questionBank: { select: { name: true } },
      },
    }),
    prisma.user.findFirst({
      where: { id: userId, role: 'STUDENT', status: 'ACTIVE' },
      select: { id: true, name: true, studentId: true, classId: true },
    }),
  ])
  if (!experiment || !student || student.classId !== experiment.classId) {
    return null
  }

  const [klass, scoreRows, reportReview, remarkRows] = await Promise.all([
    prisma.class.findUnique({ where: { id: experiment.classId }, select: { settings: true } }),
    prisma.score.findMany({
      where: { userId, indId: experiment.id, type: { in: [0, 1, 2] } },
      include: { grader: { select: { name: true } } },
      orderBy: { type: 'asc' },
    }),
    prisma.reportReview.findUnique({
      where: { userId_experimentId: { userId, experimentId: experiment.id } },
      select: { ruleId: true, ruleContent: true },
    }),
    prisma.remark.findMany({
      where: { userId, experimentId: experiment.id, text: { not: '' } },
      orderBy: { type: 'asc' },
      select: { type: true, text: true },
    }),
  ])

  const settings = parseClassSettings(klass?.settings ?? null)
  const ratio = resolveScoreRatio(settings, experiment.id)
  const scoreByType = new Map(scoreRows.map((row) => [row.type, row]))
  const total = weightedTotal(
    [0, 1, 2].map((type) => scoreByType.get(type)?.score ?? null),
    ratio,
  )

  let report: { ruleId: string; ruleContent: unknown; items: unknown } | null = null
  if (reportReview) {
    const criteria = await prisma.criteria.findUnique({
      where: { key: reportReview.ruleId },
      select: { payload: true },
    })
    const payload = parseJson(criteria?.payload ?? null) as { items?: unknown } | null
    report = {
      ruleId: reportReview.ruleId,
      ruleContent: stripCardDetail(parseJson(reportReview.ruleContent)),
      items: Array.isArray(payload?.items) ? stripCardDetail(payload.items) : [],
    }
  }

  return {
    experiment: {
      id: experiment.id,
      mark: experiment.mark,
      title: experiment.title,
      className: experiment.klass?.name ?? null,
      questionBankName: experiment.questionBank?.name ?? null,
      publishTime: experiment.publishTime,
      checkoffDeadline: experiment.checkoffDeadline,
      reportDeadline: experiment.reportDeadline,
    },
    student: { userId: student.id, name: student.name, studentId: student.studentId ?? '' },
    ratio,
    total,
    scores: scoreRows.map((row) => ({
      type: row.type,
      score: row.score,
      graderName: row.grader?.name ?? null,
      updatedAt: row.updatedAt,
    })),
    remarks: remarkRows.map((row) => ({ type: row.type, text: row.text })),
    report,
  }
}

function parseJson(value: string | null): unknown {
  if (value == null) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * 递归剔除卡片（含小节 children、ruleContent.extras 等）中的 detail 字段。
 * detail 为「详细评分标准」，仅助教 / 教师可见；学生公开查看页不得下发。
 */
function stripCardDetail(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(stripCardDetail)
  if (raw == null || typeof raw !== 'object') return raw
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === 'detail') continue
    out[key] = stripCardDetail(value)
  }
  return out
}
