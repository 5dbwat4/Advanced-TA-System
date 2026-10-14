import type { Remark, User } from '@prisma/client'

/** 附言类型：0=验收，1=实验报告 */
export const REMARK_TYPE_CHECKOFF = 0
export const REMARK_TYPE_REPORT = 1

/** 带最后编辑人的附言记录 */
export type RemarkWithEditor = Remark & { updatedBy: Pick<User, 'name'> | null }

/** 附言对外结构（附最后编辑人姓名） */
export type RemarkDto = {
  stuId: string
  experimentId: string
  type: number
  text: string
  updatedById: string | null
  updatedByName: string | null
  updatedAt: Date
}

/** 将附言记录序列化为对外结构 */
export function toRemarkDto(remark: RemarkWithEditor): RemarkDto {
  return {
    stuId: remark.stuId,
    experimentId: remark.experimentId,
    type: remark.type,
    text: remark.text,
    updatedById: remark.updatedById,
    updatedByName: remark.updatedBy?.name ?? null,
    updatedAt: remark.updatedAt,
  }
}
