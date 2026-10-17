import type { FastifyInstance } from 'fastify'

/** 课程绑定授权：由“获取课程”时签发，仅对应一名用户与一门课程 */
export type CourseBindPayload = {
  purpose: 'course-bind'
  /** 当前登录用户 id */
  sub: string
  /** 学在浙大课程 id（对应 Class.xzzdClassId） */
  courseId: string
  /** 学在浙大返回的课程名称 */
  courseName: string
  /** 仅任课教师可绑定 */
  instructor: true
}

/** 绑定授权的有效期：足够完成“创建班级 → 创建账号”两步 */
export const COURSE_BIND_TTL = '15m'

export function signCourseBindToken(
  fastify: FastifyInstance,
  input: { userId: string; courseId: string; courseName: string },
): string {
  return fastify.jwt.sign(
    {
      purpose: 'course-bind',
      sub: input.userId,
      courseId: input.courseId,
      courseName: input.courseName,
      instructor: true,
    } satisfies CourseBindPayload,
    { expiresIn: COURSE_BIND_TTL },
  )
}

/** 校验绑定授权；失败（过期 / 篡改 / 非本人）返回 null */
export function verifyCourseBindToken(
  fastify: FastifyInstance,
  token: string,
  userId: string,
): CourseBindPayload | null {
  try {
    const payload = fastify.jwt.verify<CourseBindPayload>(token)
    if (
      payload.purpose !== 'course-bind' ||
      payload.sub !== userId ||
      payload.instructor !== true ||
      typeof payload.courseId !== 'string' ||
      typeof payload.courseName !== 'string'
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
