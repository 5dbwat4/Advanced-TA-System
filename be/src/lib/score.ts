import type { Score, User } from '@prisma/client'

/** 带提交人（可选）的分数记录 */
export type ScoreWithGrader = Score & { grader: Pick<User, 'id' | 'name'> | null }

/** 分数对外结构（附提交人姓名） */
export type ScoreDto = {
  stuId: string
  type: number
  indId: string
  labId: string | null
  score: number
  graderId: string | null
  graderName: string | null
  createdAt: Date
  updatedAt: Date
}

/** 将分数记录序列化为对外结构（含最后提交人姓名） */
export function toScoreDto(score: ScoreWithGrader): ScoreDto {
  return {
    stuId: score.stuId,
    type: score.type,
    indId: score.indId,
    labId: score.labId,
    score: score.score,
    graderId: score.graderId,
    graderName: score.grader?.name ?? null,
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
  }
}
