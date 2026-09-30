import { COURSES, ZJUAM } from 'login-zju'

// TODO: 目标课程（计算机系统 II）暂时硬编码，后续改为可配置。
export const CS2_COURSE_ID = 100199

const MY_COURSES_URL = 'https://courses.zju.edu.cn/api/my-courses'

const ENROLLMENTS_URL = 'https://courses.zju.edu.cn/api/course'

const ACTIVITIES_URL = 'https://courses.zju.edu.cn/api/courses'

/** 学在浙大作业提交 / 成绩接口基址 */
const HOMEWORK_URL = 'https://courses.zju.edu.cn/api/homework'
const ACTIVITY_URL = 'https://courses.zju.edu.cn/api/activities'

/** 学在浙大课程活动接口基址（提交评分等） */
const COURSE_ACTIVITIES_URL = 'https://courses.zju.edu.cn/api/course/activities'

/** 提交评分接口的 fields 参数 */
const SUBMISSION_SCORE_FIELDS = 'id,score,instructor_comment,rubric_score,final_score,marked_submitted'

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

/** 学在浙大作业提交记录（student-submissions 接口原样返回） */
export type ZjuamHomeworkSubmission = {
  /** 提交 id */
  id: number
  created_at: string | null
  /** 提交者 ZJU person id */
  created_by: { id: number } | null
  attachments_size?: number
  instructor_comment: string | null
  instructor_score: number | null
  is_make_up: boolean
  is_preset_make_up: boolean
  is_redo: boolean
  is_resubmitted: boolean
  marked_submitted: boolean
  recommend: number
  score: number | null
  submit_by_instructor: boolean
  [key: string]: unknown
}

/** 学在浙大作业成绩（homework-scores 接口原样返回） */
export type ZjuamHomeworkScore = {
  activity_id: number
  /** 学生 ZJU person id */
  student_id: number
  final_score: string | null
  instructor_comment: string | null
  inter_score: string | null
  intra_score: string | null
  review_incomplete_score_minus: string | null
  score: string | null
  status_comment: string | null
  [key: string]: unknown
}

/** 学在浙大课程学生（course students 接口，已裁剪为 id / 姓名 / 学号） */
export type ZjuamCourseStudent = {
  /** ZJU person id（与提交记录 created_by.id、成绩 student_id 对应） */
  id: number
  name: string
  /** 学号 */
  studentNo: string
}

/** 推送流程第一步（只读）拉取到的作业数据 */
export type ZjuamHomeworkSyncData = {
  activityId: string
  submissions: ZjuamHomeworkSubmission[]
  homeworkScores: ZjuamHomeworkScore[]
  students: ZjuamCourseStudent[]
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

/** 会话池：空闲超过该时长即回收 */
const SESSION_IDLE_TTL_MS = 10 * 60 * 1000

/** 会话池：绝对存活上限（限制账号密码在内存中的留存时间） */
const SESSION_MAX_TTL_MS = 30 * 60 * 1000

/** 会话池定期清理间隔 */
const SESSION_SWEEP_INTERVAL_MS = 60 * 1000

/** 登录预热使用的轻量入口地址 */
const COURSES_HOME_URL = 'https://courses.zju.edu.cn/user/index'

type CoursesSession = {
  courses: COURSES
  /** 登录该会话时使用的密码，密码变化时重建会话 */
  password: string
  createdAt: number
  lastUsedAt: number
  /** 登录预热完成；失败时会话会被移出池 */
  ready: Promise<void>
}

const sessions = new Map<string, CoursesSession>()

function isSessionExpired(entry: CoursesSession, now: number): boolean {
  return now - entry.lastUsedAt > SESSION_IDLE_TTL_MS || now - entry.createdAt > SESSION_MAX_TTL_MS
}

function invalidateSession(account: string, entry: CoursesSession): void {
  if (sessions.get(account) === entry) sessions.delete(account)
}

/** 取用（或新建）某账号的会话；同一账号 + 密码并发调用会复用同一实例 */
function acquireSession(account: string, password: string): CoursesSession {
  const now = Date.now()
  const existing = sessions.get(account)
  if (existing && existing.password === password && !isSessionExpired(existing, now)) {
    existing.lastUsedAt = now
    return existing
  }
  if (existing) sessions.delete(account)

  const am = new ZJUAM(account, password)
  const courses = new COURSES(am)
  const entry: CoursesSession = {
    courses,
    password,
    createdAt: now,
    lastUsedAt: now,
    ready: Promise.resolve(),
  }

  // COURSES 内部只在首次 fetch 时登录，且不会因会话失效自动重登。这里先用一次
  // 轻量请求完成登录预热（之后其内部不再重复登录）；await entry.ready 的并发
  // 请求会共享这次登录，实现「每会话只登录一次」。
  entry.ready = courses.fetch(COURSES_HOME_URL).then(
    () => undefined,
    (error: unknown) => {
      invalidateSession(account, entry)
      throw toZjuamError(error)
    },
  )
  sessions.set(account, entry)
  return entry
}

// 兜底清理过期会话（取用时也会惰性判断），unref 不阻塞进程退出
const sessionSweeper = setInterval(() => {
  const now = Date.now()
  for (const [account, entry] of sessions) {
    if (isSessionExpired(entry, now)) sessions.delete(account)
  }
}, SESSION_SWEEP_INTERVAL_MS)
sessionSweeper.unref()

/**
 * 共享的登录逻辑：按账号复用已登录的 COURSES 会话（会话池）。
 *
 * - 同一账号 + 同一密码在 TTL 内复用同一实例，避免每个请求重复登录；
 * - 首次使用通过一次轻量请求完成登录预热，并发请求只登录一次；
 * - 登录失败或使用中出现鉴权失败（ZJUAM_AUTH_FAILED）时丢弃会话，下次重建；
 * - 空闲 / 绝对 TTL 到期后回收，限制账号密码在内存中的留存时间。
 */
async function withCourses<T>(
  account: string,
  password: string,
  run: (client: COURSES) => Promise<T>,
): Promise<T> {
  const entry = acquireSession(account, password)
  await entry.ready
  entry.lastUsedAt = Date.now()
  try {
    return await run(entry.courses)
  } catch (error) {
    if (error instanceof ZjuamError && error.code === 'ZJUAM_AUTH_FAILED') {
      invalidateSession(account, entry)
    }
    throw error
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

/** 请求 courses 接口并解析 JSON；统一处理登录失效 / 上游错误 */
async function fetchCourseJson(client: COURSES, url: string): Promise<unknown> {
  const response = await client
    .fetch(url, { method: 'GET', headers: { accept: 'application/json, text/plain, */*' } })
    .catch((error: unknown) => {
      throw toZjuamError(error)
    })

  if (response.status === 401 || response.status === 403) {
    throw new ZjuamError('ZJUAM_AUTH_FAILED', '统一身份认证账号或密码错误')
  }
  if (!response.ok) {
    throw new ZjuamError('ZJUAM_UNAVAILABLE', `课程服务返回 ${response.status}`)
  }

  return response.json().catch(() => {
    throw new ZjuamError('ZJUAM_UNAVAILABLE', '无法解析课程服务响应')
  })
}

/** 拉取指定作业（activityId）的全班提交记录 */
export async function fetchHomeworkSubmissions(
  account: string,
  password: string,
  activityId: string,
): Promise<ZjuamHomeworkSubmission[]> {
  return withCourses(account, password, async (client) => {
    const payload = await fetchCourseJson(
      client,
      `${HOMEWORK_URL}/${activityId}/student-submissions?need_uploads_size=true`,
    )
    const submissions = (payload as { submissions?: ZjuamHomeworkSubmission[] }).submissions
    return Array.isArray(submissions) ? submissions : []
  })
}

/** 拉取指定作业（activityId）的上游成绩列表 */
export async function fetchHomeworkScores(
  account: string,
  password: string,
  activityId: string,
): Promise<ZjuamHomeworkScore[]> {
  return withCourses(account, password, async (client) => {
    const payload = await fetchCourseJson(client, `${ACTIVITY_URL}/${activityId}/homework-scores`)
    const homeworkScores = (payload as { homework_scores?: ZjuamHomeworkScore[] }).homework_scores
    return Array.isArray(homeworkScores) ? homeworkScores : []
  })
}

/** 拉取指定课程（courseId = Class.xzzdClassId）的学生名单 */
export async function fetchCourseStudents(
  account: string,
  password: string,
  courseId: string,
): Promise<ZjuamCourseStudent[]> {
  return withCourses(account, password, async (client) => {
    const payload = await fetchCourseJson(client, `${ENROLLMENTS_URL}/${courseId}/students`)
    const rawStudents = (payload as { students?: Array<Record<string, unknown>> }).students

    return (Array.isArray(rawStudents) ? rawStudents : [])
      .map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? '').trim(),
        studentNo: String(item.user_no ?? '').trim(),
      }))
      .filter((item) => Number.isFinite(item.id) && item.name.length > 0)
  })
}

/**
 * 推送成绩流程第一步（只读）：并发拉取指定作业的提交记录、上游成绩，
 * 以及课程学生名单（用于把 person id 映射为姓名）。不做写库。
 */
export async function fetchHomeworkSyncData(
  account: string,
  password: string,
  courseId: string,
  activityId: string,
): Promise<ZjuamHomeworkSyncData> {
  const [submissions, homeworkScores, students] = await Promise.all([
    fetchHomeworkSubmissions(account, password, activityId),
    fetchHomeworkScores(account, password, activityId),
    fetchCourseStudents(account, password, courseId),
  ])

  return { activityId, submissions, homeworkScores, students }
}

export type ZjuamSubmissionScoreInput = {
  /** 学在浙大提交 id；该学生没有提交记录时为 null */
  submissionId: number | null
  /** 学生 ZJU person id */
  studentId: number
  /** 最终分（如 "90.0"） */
  score: string
  /** 评语（模板渲染结果） */
  comment: string
}

/**
 * 推送单个学生的作业成绩与评语：
 * PUT /api/course/activities/{activityId}/submission/score
 */
export async function pushSubmissionScore(
  account: string,
  password: string,
  activityId: string,
  input: ZjuamSubmissionScoreInput,
): Promise<void> {
  return withCourses(account, password, async (client) => {
    const response = await client
      .fetch(
        `${COURSE_ACTIVITIES_URL}/${activityId}/submission/score?fields=${SUBMISSION_SCORE_FIELDS}&need_submission_correct=true`,
        {
          method: 'PUT',
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json;charset=UTF-8',
          },
          body: JSON.stringify({
            score: input.score,
            reviewer_comment: input.comment,
            id: input.submissionId,
            uploads: [],
            rubric_score: [],
            student_id: input.studentId,
          }),
        },
      )
      .catch((error: unknown) => {
        throw toZjuamError(error)
      })

    if (response.status === 401 || response.status === 403) {
      throw new ZjuamError('ZJUAM_AUTH_FAILED', '统一身份认证账号或密码错误')
    }
    if (!response.ok) {
      throw new ZjuamError('ZJUAM_UNAVAILABLE', `课程服务返回 ${response.status}`)
    }
  })
}
