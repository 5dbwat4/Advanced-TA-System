import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateObject } from 'ai'
import { z } from 'zod'

import type { AiConfig } from '@/lib/ai-config'
import { SCORE_TYPES } from '@/lib/scores'
import type { StudentCase } from '@/lib/student-cases'

const learningReportSchema = z.object({
  headline: z.string(),
  trend: z.enum(['up', 'steady', 'down']),
  summary: z.string(),
  strengths: z.array(z.string()).min(1).max(5),
  weaknesses: z.array(z.string()).min(1).max(5),
  experiments: z.array(
    z.object({
      experimentId: z.string(),
      title: z.string(),
      performance: z.enum(['excellent', 'good', 'needs_work']),
      highlight: z.string(),
      deductions: z.array(z.string()).max(6),
      advice: z.string(),
    }),
  ),
  actionPlan: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
      }),
    )
    .min(1)
    .max(5),
  closing: z.string(),
})

export type LearningReport = z.infer<typeof learningReportSchema>

function scoreOf(c: StudentCase, type: number): number | null {
  return c.scores.find((score) => score.type === type)?.score ?? null
}

function performanceOf(score: number | null): 'excellent' | 'good' | 'needs_work' {
  if (score == null) return 'needs_work'
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  return 'needs_work'
}

function deductionsOf(c: StudentCase): string[] {
  if (!c.report) return []
  const list: string[] = []
  for (const group of c.report.groups) {
    if (group.kind === 'card') {
      list.push(
        `${group.card.rule || group.card.detail}（-${Math.abs(group.card.score)}）${
          group.card.appendix ? `：${group.card.appendix}` : ''
        }`,
      )
      continue
    }
    for (const card of group.cards) {
      list.push(
        `${group.title ? `${group.title} · ` : ''}${card.rule || card.detail}（-${Math.abs(card.score)}）${
          card.appendix ? `：${card.appendix}` : ''
        }`,
      )
    }
  }
  return list.slice(0, 6)
}

function demoReport(cases: StudentCase[], studentName: string): LearningReport {
  const reportScores = cases
    .map((c) => scoreOf(c, 2))
    .filter((score): score is number => score != null)
  const average =
    reportScores.length > 0
      ? Math.round(reportScores.reduce((sum, score) => sum + score, 0) / reportScores.length)
      : null

  const firstHalf = reportScores.slice(0, Math.ceil(reportScores.length / 2))
  const lastHalf = reportScores.slice(Math.ceil(reportScores.length / 2))
  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const firstAvg = avg(firstHalf)
  const lastAvg = avg(lastHalf)
  const trend: LearningReport['trend'] =
    firstAvg != null && lastAvg != null && lastAvg - firstAvg > 5
      ? 'up'
      : firstAvg != null && lastAvg != null && firstAvg - lastAvg > 5
        ? 'down'
        : 'steady'

  const ranked = [...cases]
    .filter((c) => scoreOf(c, 2) != null)
    .sort((a, b) => (scoreOf(b, 2) ?? 0) - (scoreOf(a, 2) ?? 0))
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]

  const deductionCount = new Map<string, number>()
  for (const c of cases) {
    for (const deduction of deductionsOf(c)) {
      const key = deduction.split('（')[0] ?? deduction
      deductionCount.set(key, (deductionCount.get(key) ?? 0) + 1)
    }
  }
  const commonDeductions = [...deductionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([rule, count]) => `${rule}（出现 ${count} 次）`)

  const strengths = [
    best
      ? `${best.experiment.mark} ${best.experiment.title} 表现最好，报告得分 ${scoreOf(best, 2)}。`
      : '已开始积累实验数据。',
    reportScores.length > 0
      ? `已完成 ${reportScores.length} 个实验报告评分，平均 ${average} 分。`
      : '尚未产生报告评分，建议先完成报告批改。',
  ]
  if (cases.some((c) => c.reportRemark?.text?.trim())) {
    strengths.push('教师评语记录较完整，可作为后续改进依据。')
  }

  const weaknesses = [
    worst && worst !== best
      ? `${worst.experiment.mark} ${worst.experiment.title} 得分相对较低（${scoreOf(worst, 2)}），需要重点关注。`
      : '各实验表现较为均衡，暂无明显短板。',
    commonDeductions.length > 0
      ? `常见扣分点：${commonDeductions.join('；')}。`
      : '暂未发现重复出现的扣分模式。',
  ]

  const experiments = cases.map((c) => {
    const score = scoreOf(c, 2)
    const deductions = deductionsOf(c)
    return {
      experimentId: c.experiment.id,
      title: `${c.experiment.mark} ${c.experiment.title}`,
      performance: performanceOf(score),
      highlight:
        c.reportRemark?.text?.trim() ||
        (score != null ? `报告得分 ${score} 分。` : '尚未完成报告评分。'),
      deductions,
      advice:
        deductions.length > 0
          ? '针对上述扣分点补充实验分析，并在下一次报告中主动说明改进措施。'
          : score != null
            ? '保持当前完成度，注意报告结构的完整性和结论的严谨性。'
            : '尽快完成报告提交与批改，以便形成完整的学情记录。',
    }
  })

  return {
    headline:
      average != null
        ? `${studentName} 的学情概览：报告平均 ${average} 分`
        : `${studentName} 的学情概览`,
    trend,
    summary:
      average != null
        ? `目前共完成 ${reportScores.length} 个实验报告评分，平均 ${average} 分。${trend === 'up' ? '整体呈进步趋势。' : trend === 'down' ? '近期表现有所回落。' : '整体表现较为稳定。'}`
        : '当前可用的报告评分较少，建议先完成更多实验批改后再生成学情报告。',
    strengths,
    weaknesses,
    experiments,
    actionPlan: [
      {
        title: '补齐薄弱实验',
        detail: worst
          ? `优先复盘 ${worst.experiment.mark} ${worst.experiment.title} 的扣分项，补充数据与分析。`
          : '按实验顺序检查报告完整性。',
      },
      {
        title: '减少重复扣分',
        detail:
          commonDeductions.length > 0
            ? `在下一次报告中重点检查：${commonDeductions.map((item) => item.split('（')[0]).join('、')}。`
            : '对照评分标准逐条自查后再提交。',
      },
      {
        title: '保持复盘习惯',
        detail: '每次收到评语后记录一条改进措施，并在下一次实验中验证效果。',
      },
    ],
    closing: '以上为演示模式生成的学情报告，请结合教师评语与课堂表现人工复核。',
  }
}

function serializeCase(c: StudentCase) {
  const reportScore = scoreOf(c, 2)
  return {
    experimentId: c.experiment.id,
    mark: c.experiment.mark,
    title: c.experiment.title,
    scores: c.scores.map((score) => ({
      type: score.type,
      label: SCORE_TYPES.find((item) => item.value === score.type)?.label ?? String(score.type),
      score: score.score,
      grader: score.graderName,
      updatedAt: score.updatedAt,
    })),
    report:
      reportScore == null
        ? null
        : {
            score: reportScore,
            groups: c.report?.groups.map((group) =>
              group.kind === 'card'
                ? {
                    rule: group.card.rule,
                    detail: group.card.detail,
                    score: group.card.score,
                    appendix: group.card.appendix,
                  }
                : {
                    section: group.title,
                    score: group.score,
                    cards: group.cards.map((card) => ({
                      rule: card.rule,
                      detail: card.detail,
                      score: card.score,
                      appendix: card.appendix,
                    })),
                  },
            ),
          },
    remarks: {
      report: c.reportRemark?.text ?? '',
      checkoff: c.checkoffRemark?.text ?? '',
    },
  }
}

export async function generateLearningReport({
  studentName,
  cases,
  config,
}: {
  studentName: string
  cases: StudentCase[]
  config: AiConfig
}): Promise<LearningReport> {
  if (config.demoMode) return demoReport(cases, studentName)

  if (!config.apiKey) {
    throw new Error('请先在「设置 → AI 能力」中填写 API Key，或开启演示模式')
  }

  const provider = createOpenAICompatible({
    name: 'tasaas',
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey,
  })
  const model = provider.chatModel(config.model || 'gpt-4o-mini')

  const { object } = await generateObject({
    model,
    schema: learningReportSchema,
    system: `你是一名课程助教，需要根据学生所有实验的报告评分、教师评语和扣分明细，生成一份可读的学情报告。
要求：
- 只使用输入数据，不要编造实验、分数或评语；
- headline 用一句话概括；summary 用 2-3 句总览；
- strengths / weaknesses 各 2-4 条，必须引用具体实验或扣分点；
- experiments 必须覆盖输入中的每个 experimentId，deductions 只列实际扣分项；
- actionPlan 给出 2-4 条可执行建议；
- 使用简体中文，语气客观、建设性。`,
    prompt: `学生：${studentName}\n\n实验数据：\n${JSON.stringify(
      cases.map(serializeCase),
      null,
      2,
    )}`,
    temperature: 0,
  })

  return object
}
