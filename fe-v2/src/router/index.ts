import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { useAppStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth'
import { homePathFor, studentHomePath } from '@/lib/student-route'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    role?: 'STAFF' | 'STUDENT' | 'VIEWER'
    public?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/console' },
  {
    path: '/login',
    component: () => import('@/pages/auth/Login.vue'),
    meta: { guestOnly: true },
  },
  { path: '/login/select', component: () => import('@/pages/auth/LoginSelect.vue') },
  { path: '/login/class', component: () => import('@/pages/auth/LoginClassSelect.vue') },
  {
    path: '/setup',
    component: () => import('@/pages/account/Setup.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/home', redirect: '/student-console' },
  {
    path: '/settings',
    component: () => import('@/pages/account/Settings.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/student/unlock',
    component: () => import('@/pages/student/StudentUnlock.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/student-console',
    component: () => import('@/components/layout/StudentShell.vue'),
    meta: { requiresAuth: true, role: 'STUDENT' },
    children: [
      { path: '', component: () => import('@/pages/student/StudentOverview.vue') },
      { path: 'scores', component: () => import('@/pages/student/StudentScores.vue') },
      { path: 'experiments/:id', component: () => import('@/pages/student/StudentExperiment.vue') },
      { path: 'settings', component: () => import('@/pages/student/StudentSettings.vue') },
    ],
  },
  {
    path: '/viewer',
    component: () => import('@/pages/viewer/ViewerHome.vue'),
    meta: { requiresAuth: true, role: 'VIEWER' },
  },

  {
    path: '/console/reports/:id',
    component: () => import('@/pages/console/reports/ReportGrade.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
  },
  {
    path: '/console/checkoff',
    component: () => import('@/pages/console/checkoff/Checkoff.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
  },
  {
    path: '/console/checkoff/special',
    component: () => import('@/pages/console/checkoff/SpecialDrawEditor.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
  },
  {
    path: '/console/reports/:id/criteria/new',
    component: () => import('@/pages/console/reports/ReportCriteria.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
  },
  {
    path: '/console/criteria/:key/edit',
    component: () => import('@/pages/console/reports/ReportCriteria.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
  },
  {
    path: '/console/courses/new-account',
    component: () => import('@/pages/console/courses/NewClassAccount.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
  },

  {
    path: '/console',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { requiresAuth: true, role: 'STAFF' },
    children: [
      { path: '', component: () => import('@/pages/console/Dashboard.vue') },
      { path: 'checkoff/cards', component: () => import('@/pages/console/checkoff/CustomCards.vue') },
      { path: 'boards', component: () => import('@/pages/console/boards/Boards.vue') },
      { path: 'boards/scan', component: () => import('@/pages/console/boards/BoardScan.vue') },
      { path: 'experiments', component: () => import('@/pages/console/experiments/Experiments.vue') },
      { path: 'experiments/:id', component: () => import('@/pages/console/experiments/ExperimentDetail.vue') },
      { path: 'experiments/:id/xzzd-push', component: () => import('@/pages/console/experiments/XzzdPush.vue') },
      { path: 'remarks/experiments/:id', component: () => import('@/pages/console/experiments/ExperimentRemarks.vue') },
      { path: 'questions', component: () => import('@/pages/console/questions/Questions.vue') },
      { path: 'questions/banks/new', component: () => import('@/pages/console/questions/NewBank.vue') },
      { path: 'questions/banks/:id/manage', component: () => import('@/pages/console/questions/BankManage.vue') },
      { path: 'questions/banks/:id', component: () => import('@/pages/console/questions/BankDetail.vue') },
      { path: 'reports', component: () => import('@/pages/console/reports/Reports.vue') },
      { path: 'criteria', component: () => import('@/pages/console/reports/CriteriaManage.vue') },
      { path: 'more', component: () => import('@/pages/console/More.vue') },
      { path: 'scores', component: () => import('@/pages/console/scores/Scores.vue') },
      { path: 'scores/students/:userId', component: () => import('@/pages/console/scores/StudentReport.vue') },
      { path: 'scores/standalone', component: () => import('@/pages/console/scores/ScoreEntry.vue') },
      { path: 'courses/settings', component: () => import('@/pages/console/courses/CourseSettings.vue') },
      { path: 'courses/users/new', component: () => import('@/pages/console/courses/AddCourseUser.vue') },
      { path: 'courses/sync-scores', component: () => import('@/pages/console/courses/XzzdScoreSync.vue') },
      { path: 'courses/new', component: () => import('@/pages/console/courses/NewCourse.vue') },
      { path: 'courses/checkpoints', component: () => import('@/pages/console/courses/Checkpoints.vue') },
      { path: 'courses/focus-students', component: () => import('@/pages/console/courses/FocusStudents.vue') },
      { path: 'settings', component: () => import('@/pages/account/Settings.vue') },
    ],
  },

  {
    path: '/changelog',
    component: () => import('@/components/layout/PublicLayout.vue'),
    meta: { public: true },
    children: [{ path: '', component: () => import('@/pages/public/Changelog.vue') }],
  },
  {
    path: '/invite',
    component: () => import('@/components/layout/PublicLayout.vue'),
    meta: { public: true },
    children: [{ path: '', component: () => import('@/pages/public/Invite.vue') }],
  },
  {
    path: '/license',
    component: () => import('@/components/layout/PublicLayout.vue'),
    meta: { public: true },
    children: [{ path: '', component: () => import('@/pages/public/Licenses.vue') }],
  },
  {
    path: '/license/full',
    component: () => import('@/components/layout/PublicLayout.vue'),
    meta: { public: true },
    children: [{ path: '', component: () => import('@/pages/public/LicensesFull.vue') }],
  },
  {
    path: '/terms',
    component: () => import('@/pages/public/Terms.vue'),
    meta: { public: true },
  },
  {
    path: '/checkin',
    component: () => import('@/pages/checkin/Checkin.vue'),
    meta: { public: true },
  },
  {
    path: '/checkin/:token',
    component: () => import('@/pages/checkin/CheckinSession.vue'),
    meta: { public: true },
  },
  {
    path: '/student-preview/view',
    component: () => import('@/pages/student/StudentPreviewView.vue'),
    meta: { public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/components/layout/PublicLayout.vue'),
    meta: { public: true },
    children: [{ path: '', component: () => import('@/pages/public/NotFound.vue') }],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureReady()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const role = to.matched
    .map((record) => record.meta.role)
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .pop()

  if (requiresAuth && !auth.user) {
    return { path: '/login', query: { from: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.user) return homePathFor(auth.user)

  if (auth.user) {
    if (!auth.user.username && to.path !== '/setup') return '/setup'
    if (auth.user.username && to.path === '/setup' && !useAppStore().onboarding) {
      return homePathFor(auth.user)
    }
  }

  if (role === 'STAFF' && auth.user) {
    if (auth.user.role === 'STUDENT') return studentHomePath(auth.user)
    if (auth.user.role === 'VIEWER') return homePathFor(auth.user)
  }
  if (role === 'STUDENT' && auth.user && auth.user.role !== 'STUDENT') {
    return homePathFor(auth.user)
  }
  if (role === 'VIEWER' && auth.user && auth.user.role !== 'VIEWER') {
    return homePathFor(auth.user)
  }

  return true
})

export default router
