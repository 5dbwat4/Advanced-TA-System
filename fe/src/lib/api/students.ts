import { apiFetch } from '@/lib/api/client'

/** 学生查看页数据（公开接口，凭签名 token 访问） */
export type StudentPreviewData = {
  experiment: {
    id: string
    mark: string
    title: string
    className: string | null
    questionBankName: string | null
    publishTime: string | null
    checkoffDeadline: string | null
    reportDeadline: string | null
  }
  student: { userId: string; name: string; studentId: string }
  /** 生效评分占比：功能测试 / 验收问答 / 报告 */
  ratio: number[]
  total: number | null
  scores: Array<{
    /** 0=功能测试 1=验收问答 2=报告 */
    type: number
    score: number
    graderName: string | null
    updatedAt: string
  }>
  /** 报告批阅记录：ruleContent 为精简批阅格式，items 为评分标准条目 */
  report: {
    ruleId: string
    ruleContent: unknown
    items: unknown
  } | null
  /** 助教填写的附言（0=验收，1=实验报告），仅含非空项 */
  remarks: Array<{ type: number; text: string }>
}

export function fetchStudentPreview(token: string): Promise<StudentPreviewData> {
  return apiFetch<StudentPreviewData>(
    `/api/student-preview/view?token=${encodeURIComponent(token)}`,
  )
}

/** 助教 / 观察者查看某学生在某实验下的成绩详情 */
export function fetchStudentExperimentReport(
  userId: string,
  experimentId: string,
): Promise<StudentPreviewData> {
  return apiFetch<StudentPreviewData>(
    `/api/student-preview/experiment?userId=${encodeURIComponent(userId)}&experimentId=${encodeURIComponent(experimentId)}`,
  )
}

export type StudentOverviewExperiment = {
  id: string
  mark: string
  title: string
  publishTime: string | null
  checkoffDeadline: string | null
  reportDeadline: string | null
  ratio: number[]
  total: number | null
  scores: Array<{ type: number; score: number }>
  hasReport: boolean
  remarkCount: number
}

export type StudentOverview = {
  class: { id: string; name: string; type: string } | null
  student: { name: string; studentId: string }
  experiments: StudentOverviewExperiment[]
}

export function fetchStudentOverview(): Promise<StudentOverview> {
  return apiFetch<StudentOverview>('/api/student/overview')
}

export function fetchStudentExperiment(id: string): Promise<StudentPreviewData> {
  return apiFetch<StudentPreviewData>(`/api/student/experiments/${encodeURIComponent(id)}`)
}
