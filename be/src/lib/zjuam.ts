import { COURSES, ZJUAM } from 'login-zju'

// TODO: 目标课程（计算机系统 II）暂时硬编码，后续改为可配置。
export const CS2_COURSE_ID = 100199

const MY_COURSES_URL = 'https://courses.zju.edu.cn/api/my-courses'

const ENROLLMENTS_URL = 'https://courses.zju.edu.cn/api/course'

const ACTIVITIES_URL = 'https://courses.zju.edu.cn/api/courses'

const ENROLLMENTS_FIELDS =
  'id,user(id,email,name,nickname,user_no,comment,grade(id,name),klass(id,name,code),department(id,name,code),org(id,name),program(id,name),user_attributes(tag,children_names,education)),roles,aliases,retake_status,seat_number,data,imported_from,imported_track_id'

const LIST_COURSES_PAGE_SIZE = 100
const LIST_COURSES_MAX_PAGES = 10

const MY_COURSES_BODY = {"fields":"id,name,course_code,department(id,name),grade(id,name),klass(id,name),course_type,cover,small_cover,start_date,end_date,is_started,is_closed,academic_year_id,semester_id,credit,compulsory,second_name,display_name,created_user(id,name),org(is_enterprise_or_organization),org_id,public_scope,audit_status,audit_remark,can_withdraw_course,imported_from,allow_clone,is_instructor,is_team_teaching,is_default_course_cover,archived,instructors(id,name,email,avatar_small_url),course_attributes(teaching_class_name,is_during_publish_period,copy_status,tip,data,audience_type,graduate_method),user_stick_course_record(id),classroom_schedule","page":1,"page_size":10,"conditions":{"status":["ongoing","notStarted"],"keyword":"","classify_type":"recently_started","display_studio_list":false},"showScorePassedStatus":false}



export type ZjuamErrorCode = 'ZJUAM_AUTH_FAILED' | 'ZJUAM_UNAVAILABLE'

export class ZjuamError extends Error {
  code: ZjuamErrorCode

  constructor(code: ZjuamErrorCode, message: string) {
    super(message)
    this.name = 'ZjuamError'
    this.code = code
  }
}

export interface ZjuamCourse {
  id: number
  name?: string
  is_instructor?: boolean
  [key: string]: unknown
}

export type ZjuamCourseSummary = {
  id: number
  name: string
  displayName: string | null
  courseCode: string | null
  isInstructor: boolean
}

export interface ZjuamProfile {
  account: string
  /**
   * login-zju 未对外暴露任何用户资料接口，name / studentId / zjuPersonId
   * 留待后续通过额外的用户信息接口补充。
   */
  name?: string
  studentId?: string
  zjuPersonId?: number
}

export interface ZjuamLoginResult {
  ok: true
  isInstructor: boolean
  course: ZjuamCourse | null
  coursesCount: number
  /** 拉取列表中所有 is_instructor === true 的课程 id */
  instructorCourseIds: number[]
  profile: ZjuamProfile
}

interface MyCoursesResponse {
  courses?: ZjuamCourse[]
}

interface ZjuamEnrollmentEntry {
  roles?: unknown
  user?: {
    user_no?: unknown
    name?: unknown
  }
}

interface EnrollmentsResponse {
  enrollments?: ZjuamEnrollmentEntry[]
}

export type ZjuamEnrollment = { studentNo: string; name: string }

/** 学在浙大作业（activity type = "homework"）摘要 */
export type ZjuamHomeworkActivity = {
  /** activity id（绑定到 Experiment 的值） */
  id: number
  title: string
  uniqueKey: string
  endTime: string | null
  isClosed: boolean
  hasScoreCount: number
}

interface ActivitiesResponse {
  activities?: Array<{
    id?: unknown
    title?: unknown
    unique_key?: unknown
    type?: unknown
    end_time?: unknown
    is_closed?: unknown
    has_score_count?: unknown
  }>
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function toZjuamError(error: unknown): ZjuamError {
  const message = errorMessage(error)
  if (/Failed to login:/i.test(message)) {
    return new ZjuamError('ZJUAM_AUTH_FAILED', '统一身份认证账号或密码错误')
  }
  return new ZjuamError('ZJUAM_UNAVAILABLE', '统一身份认证服务暂时不可用')
}

type MyCoursesPageFetcher = (page: number, pageSize: number) => Promise<ZjuamCourse[]>

/**
 * 共享的登录逻辑：创建 ZJUAM / COURSES 实例并交给 run 回调使用，结束后在
 * finally 中释放实例引用。所有需要访问学在浙大课程服务的接口均复用此逻辑。
 */
async function withCourses<T>(
  account: string,
  password: string,
  run: (client: COURSES) => Promise<T>,
): Promise<T> {
  // login-zju 的 ZJUAM 未暴露 logout / clear / destroy / reset 等注销接口，
  // 账号密码与 Cookie 均保存在实例私有字段（非模块级 / 静态）中。因此这里
  // 将两个实例严格限制为函数局部变量，并在 finally 中释放引用，确保登录 +
  // 请求结束后内存中的凭据尽快被 GC 回收（成功或失败都会执行）。
  let am: ZJUAM | undefined
  let courses: COURSES | undefined

  try {
    am = new ZJUAM(account, password)
    courses = new COURSES(am)
    return await run(courses)
  } finally {
    // 释放实例引用，使私有字段中的凭据 / Cookie 可被回收。
    courses = undefined
    am = undefined
  }
}

/**
 * 在 withCourses 之上实现「按页拉取我的课程」：loginToCourses 与 listCourses 复用。
 */
async function withMyCourses<T>(
  account: string,
  password: string,
  run: (fetchPage: MyCoursesPageFetcher) => Promise<T>,
): Promise<T> {
  return withCourses(account, password, async (client) => {
    const fetchPage: MyCoursesPageFetcher = async (page, pageSize) => {
      const response = await client
        .fetch(MY_COURSES_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json, text/plain, */*',
            'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'content-type': 'application/json;charset=UTF-8',
          },
          body: JSON.stringify({ ...MY_COURSES_BODY, page, page_size: pageSize }),
        })
        .catch((error: unknown) => {
          throw toZjuamError(error)
        })


      if (response.status === 401 || response.status === 403) {
        throw new ZjuamError('ZJUAM_AUTH_FAILED', '统一身份认证账号或密码错误')
      }
      if (!response.ok) {
        throw new ZjuamError('ZJUAM_UNAVAILABLE', `课程服务返回 ${response.status}`)
      }

      const payload = (await response.json().catch(() => {
        throw new ZjuamError('ZJUAM_UNAVAILABLE', '无法解析课程服务响应')
      })) as MyCoursesResponse

      return Array.isArray(payload.courses) ? payload.courses : []
    }

    return run(fetchPage)
  })
}

export async function loginToCourses(account: string, password: string): Promise<ZjuamLoginResult> {
  return withMyCourses(account, password, async (fetchPage) => {
    const courseList = await fetchPage(MY_COURSES_BODY.page, MY_COURSES_BODY.page_size)
    const matchedCourse = courseList.find((course) => course.id === CS2_COURSE_ID) ?? null
    const instructorCourseIds = courseList
      .filter((course) => course.is_instructor === true)
      .map((course) => course.id)

    return {
      ok: true,
      isInstructor: matchedCourse?.is_instructor === true,
      course: matchedCourse,
      coursesCount: courseList.length,
      instructorCourseIds,
      profile: { account },
    }
  })
}

/**
 * 拉取当前账号在学在浙大的全部课程（分页循环，最多 LIST_COURSES_MAX_PAGES 页）。
 */
export async function listCourses(account: string, password: string): Promise<ZjuamCourseSummary[]> {
  return withMyCourses(account, password, async (fetchPage) => {
    const summaries: ZjuamCourseSummary[] = []

    for (let page = 1; page <= LIST_COURSES_MAX_PAGES; page += 1) {
      const pageCourses = await fetchPage(page, LIST_COURSES_PAGE_SIZE)
      console.log(pageCourses)

      for (const course of pageCourses) {
        summaries.push({
          id: course.id,
          name: String(course.name ?? course.display_name ?? course.second_name ?? ''),
          displayName: (course.display_name as string | undefined) ?? null,
          courseCode: (course.course_code as string | undefined) ?? null,
          isInstructor: course.is_instructor === true,
        })
      }

      if (pageCourses.length < LIST_COURSES_PAGE_SIZE) break
    }

    return summaries
  })
}

/**
 * 拉取指定学在浙大课程（courseId = Class.xzzdClassId）的学生名单。
 * 仅保留 roles 中包含 "student" 的选课记录，过滤掉助教 / 教师。
 */
export async function listEnrollments(
  account: string,
  password: string,
  courseId: string,
): Promise<ZjuamEnrollment[]> {
  return withCourses(account, password, async (client) => {
    const response = await client
      .fetch(`${ENROLLMENTS_URL}/${courseId}/enrollments`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify({ fields: ENROLLMENTS_FIELDS }),
      })
      .catch((error: unknown) => {
        throw toZjuamError(error)
      })

    if (response.status === 401 || response.status === 403) {
      throw new ZjuamError('ZJUAM_AUTH_FAILED', '统一身份认证账号或密码错误')
    }
    if (!response.ok) {
      throw new ZjuamError('ZJUAM_UNAVAILABLE', `课程服务返回 ${response.status}`)
    }

    const payload = (await response.json().catch(() => {
      throw new ZjuamError('ZJUAM_UNAVAILABLE', '无法解析课程服务响应')
    })) as EnrollmentsResponse

    const enrollments = Array.isArray(payload.enrollments) ? payload.enrollments : []

    return enrollments
      .filter((entry) => Array.isArray(entry.roles) && entry.roles.includes('student'))
      .map((entry) => ({
        studentNo: String(entry.user?.user_no ?? '').trim(),
        name: String(entry.user?.name ?? '').trim(),
      }))
      .filter((entry) => entry.studentNo.length > 0 && entry.name.length > 0)
  })
}

/**
 * 拉取指定学在浙大课程（courseId = Class.xzzdClassId）的作业列表。
 * 接口返回该课程全部 activities，这里只保留 type === "homework" 的条目。
 */
export async function listHomeworkActivities(
  account: string,
  password: string,
  courseId: string,
): Promise<ZjuamHomeworkActivity[]> {
  return withCourses(account, password, async (client) => {
    const response = await client
      .fetch(`${ACTIVITIES_URL}/${courseId}/activities`, {
        method: 'GET',
        headers: {
          accept: 'application/json, text/plain, */*',
        },
      })
      .catch((error: unknown) => {
        throw toZjuamError(error)
      })

    if (response.status === 401 || response.status === 403) {
      throw new ZjuamError('ZJUAM_AUTH_FAILED', '统一身份认证账号或密码错误')
    }
    if (!response.ok) {
      throw new ZjuamError('ZJUAM_UNAVAILABLE', `课程服务返回 ${response.status}`)
    }

    const payload = (await response.json().catch(() => {
      throw new ZjuamError('ZJUAM_UNAVAILABLE', '无法解析课程服务响应')
    })) as ActivitiesResponse

    const activities = Array.isArray(payload.activities) ? payload.activities : []

    return activities
      .filter((activity) => activity.type === 'homework')
      .map((activity) => ({
        id: Number(activity.id),
        title: String(activity.title ?? '').trim(),
        uniqueKey: String(activity.unique_key ?? '').trim(),
        endTime: typeof activity.end_time === 'string' ? activity.end_time : null,
        isClosed: activity.is_closed === true,
        hasScoreCount: Number(activity.has_score_count ?? 0),
      }))
      .filter((activity) => Number.isFinite(activity.id) && activity.title.length > 0)
  })
}
