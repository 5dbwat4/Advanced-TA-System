import { decodeReviewContent, collectReportGroups, type ReportGroup } from '@/components/criteria/scoring'
import type { CriterionItem } from '@/components/criteria/types'
import {
  fetchClassTables,
  fetchCriteria,
  fetchRemark,
  fetchReportReview,
  REMARK_TYPE_CHECKOFF,
  REMARK_TYPE_REPORT,
  type Experiment,
  type Remark,
  type ReportReview,
  type Score,
  type Student,
} from '@/lib/api'

export type StudentReportDetail = {
  review: ReportReview
  items: CriterionItem[]
  groups: ReportGroup[]
}

export type StudentCase = {
  experiment: Experiment
  scores: Score[]
  report: StudentReportDetail | null
  reportRemark: Remark | null
  checkoffRemark: Remark | null
}

export type StudentCaseSet = {
  student: Student
  cases: StudentCase[]
}

export async function loadStudentCases(
  classId: string,
  userId: string,
): Promise<StudentCaseSet> {
  const { students, experiments, scores } = await fetchClassTables(classId)
  const student = students.find((item) => item.userId === userId)
  if (!student) throw new Error('未找到该学生')

  const classExperiments = experiments.filter((item) => item.classId === classId)
  const cases = await Promise.all(
    classExperiments.map(async (experiment): Promise<StudentCase> => {
      const experimentScores = scores.filter(
        (score) => score.userId === userId && score.indId === experiment.id,
      )
      const hasReport = experimentScores.some((score) => score.type === 2)

      const [reportRemark, checkoffRemark] = await Promise.all([
        fetchRemark(userId, experiment.id, REMARK_TYPE_REPORT).catch(() => null),
        fetchRemark(userId, experiment.id, REMARK_TYPE_CHECKOFF).catch(() => null),
      ])

      let report: StudentReportDetail | null = null
      if (hasReport) {
        try {
          const review = await fetchReportReview(userId, experiment.id)
          if (review) {
            const criteria = await fetchCriteria(review.ruleId)
            if (criteria.payload?.items) {
              const content = decodeReviewContent(review.ruleContent)
              report = {
                review,
                items: criteria.payload.items,
                groups: collectReportGroups(criteria.payload.items, content.cards, content.extras),
              }
            }
          }
        } catch {
          report = null
        }
      }

      return {
        experiment,
        scores: experimentScores,
        report,
        reportRemark,
        checkoffRemark,
      }
    }),
  )

  return { student, cases }
}
