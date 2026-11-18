import { Spinner } from '@heroui/react'
import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { RedirectIfAuthed } from '@/components/auth/RedirectIfAuthed'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireOnboarding } from '@/components/auth/RequireOnboarding'
import { RequireStaff } from '@/components/auth/RequireStaff'
import { RequireStudent } from '@/components/auth/RequireStudent'
import { RequireViewer } from '@/components/auth/RequireViewer'
import { AppShell } from '@/components/layout/AppShell'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { StudentShell } from '@/components/layout/StudentShell'
import { ViewerShell } from '@/components/layout/ViewerShell'

const AddCourseUser = lazy(() => import('@/pages/console/courses/AddCourseUser'))
const BankDetail = lazy(() => import('@/pages/console/questions/BankDetail'))
const BankManage = lazy(() => import('@/pages/console/questions/BankManage'))
const BoardScan = lazy(() => import('@/pages/console/boards/BoardScan'))
const Boards = lazy(() => import('@/pages/console/boards/Boards'))
const Changelog = lazy(() => import('@/pages/public/Changelog'))
const Checkin = lazy(() => import('@/pages/checkin/Checkin'))
const CheckinSession = lazy(() => import('@/pages/checkin/CheckinSession'))
const Checkoff = lazy(() => import('@/pages/console/checkoff/Checkoff'))
const CheckoffMulti = lazy(() => import('@/pages/console/checkoff/CheckoffMulti'))
const CheckoffQueue = lazy(() => import('@/pages/console/checkoff/CheckoffQueue'))
const CheckoffQueueNew = lazy(() => import('@/pages/console/checkoff/CheckoffQueueNew'))
const Checkpoints = lazy(() => import('@/pages/console/courses/Checkpoints'))
const CourseSettings = lazy(() => import('@/pages/console/courses/CourseSettings'))
const CriteriaManage = lazy(() => import('@/pages/console/reports/CriteriaManage'))
const CustomCards = lazy(() => import('@/pages/console/checkoff/CustomCards'))
const Dashboard = lazy(() => import('@/pages/console/Dashboard'))
const DocArticle = lazy(() => import('@/pages/docs/DocArticle'))
const DocsIndex = lazy(() => import('@/pages/docs/DocsIndex'))
const DocsLayout = lazy(() => import('@/pages/docs/DocsLayout'))
const ExperimentDetail = lazy(() => import('@/pages/console/experiments/ExperimentDetail'))
const ExperimentRemarks = lazy(() => import('@/pages/console/experiments/ExperimentRemarks'))
const Experiments = lazy(() => import('@/pages/console/experiments/Experiments'))
const FocusStudents = lazy(() => import('@/pages/console/courses/FocusStudents'))
const Invite = lazy(() => import('@/pages/public/Invite'))
const Licenses = lazy(() => import('@/pages/public/Licenses'))
const LicensesFull = lazy(() => import('@/pages/public/LicensesFull'))
const LlmConnect = lazy(() => import('@/pages/console/LlmConnect'))
const Login = lazy(() => import('@/pages/auth/Login'))
const LoginClassSelect = lazy(() => import('@/pages/auth/LoginClassSelect'))
const LoginDebug = lazy(() => import('@/pages/auth/LoginDebug'))
const LoginSelect = lazy(() => import('@/pages/auth/LoginSelect'))
const More = lazy(() => import('@/pages/console/More'))
const NewBank = lazy(() => import('@/pages/console/questions/NewBank'))
const NewClassAccount = lazy(() => import('@/pages/console/courses/NewClassAccount'))
const NewCourse = lazy(() => import('@/pages/console/courses/NewCourse'))
const NotFound = lazy(() => import('@/pages/public/NotFound'))
const Questions = lazy(() => import('@/pages/console/questions/Questions'))
const ReportCriteria = lazy(() => import('@/pages/console/reports/ReportCriteria'))
const ReportGrade = lazy(() => import('@/pages/console/reports/ReportGrade'))
const Reports = lazy(() => import('@/pages/console/reports/Reports'))
const ScoreEntry = lazy(() => import('@/pages/console/scores/ScoreEntry'))
const Scores = lazy(() => import('@/pages/console/scores/Scores'))
const Settings = lazy(() => import('@/pages/account/Settings'))
const Setup = lazy(() => import('@/pages/account/Setup'))
const SpecialDrawEditor = lazy(() => import('@/pages/console/checkoff/SpecialDrawEditor'))
const TagDetail = lazy(() => import('@/pages/console/tag/TagDetail'))
const Tags = lazy(() => import('@/pages/console/tag/Tags'))
const StudentExperiment = lazy(() => import('@/pages/student/StudentExperiment'))
const StudentOverview = lazy(() => import('@/pages/student/StudentOverview'))
const StudentQueue = lazy(() => import('@/pages/student/StudentQueue'))
const StudentScores = lazy(() => import('@/pages/student/StudentScores'))
const StudentSettings = lazy(() => import('@/pages/student/StudentSettings'))
const StudentUnlock = lazy(() => import('@/pages/student/StudentUnlock'))
const StudentPreviewView = lazy(() => import('@/pages/student/StudentPreviewView'))
const StudentReport = lazy(() => import('@/pages/console/scores/StudentReport'))
const Terms = lazy(() => import('@/pages/public/Terms'))
const ViewerCourseSettings = lazy(() => import('@/pages/viewer/ViewerCourseSettings'))
const ViewerExperiments = lazy(() => import('@/pages/viewer/ViewerExperiments'))
const ViewerFocusStudents = lazy(() => import('@/pages/viewer/ViewerFocusStudents'))
const ViewerScores = lazy(() => import('@/pages/viewer/ViewerScores'))
const XzzdPush = lazy(() => import('@/pages/console/experiments/XzzdPush'))
const XzzdScoreSync = lazy(() => import('@/pages/console/courses/XzzdScoreSync'))

function RouteLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export default function App() {
  useEffect(() => {
    const splash = document.getElementById('app-splash')
    if (!splash) return
    if ((window as Window & { __BOOT_FAILED__?: boolean }).__BOOT_FAILED__) return

    window.dispatchEvent(new Event('pb:app-ready'))

    // 短暂停留，让真实进度能显示到 100%，再淡出 splash。
    const hideTimer = window.setTimeout(() => {
      if ((window as Window & { __BOOT_FAILED__?: boolean }).__BOOT_FAILED__) return
      splash.classList.add('app-splash--hidden')
    }, 120)

    return () => window.clearTimeout(hideTimer)
  }, [])

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/console" replace />} />
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<Login />} />
        </Route>
        <Route path="/login/debug" element={<LoginDebug />} />
        <Route path="/login/select" element={<LoginSelect />} />
        <Route path="/login/class" element={<LoginClassSelect />} />
        <Route element={<RequireOnboarding />}>
          <Route path="/setup" element={<Setup />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/home" element={<Navigate to="/student-console" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/student/unlock" element={<StudentUnlock />} />
          <Route element={<RequireStudent />}>
            <Route path="/student-console" element={<StudentShell />}>
              <Route index element={<StudentOverview />} />
              <Route path="queue" element={<StudentQueue />} />
              <Route path="scores" element={<StudentScores />} />
              <Route path="experiments/:id" element={<StudentExperiment />} />
              <Route path="settings" element={<StudentSettings />} />
            </Route>
          </Route>
          <Route element={<RequireViewer />}>
            <Route path="/viewer" element={<ViewerShell />}>
              <Route index element={<Navigate to="/viewer/experiments" replace />} />
              <Route path="experiments" element={<ViewerExperiments />} />
              <Route path="experiments/:id" element={<ExperimentDetail readonly />} />
              <Route path="experiments/:id/remarks" element={<ExperimentRemarks readonly />} />
              <Route path="scores" element={<ViewerScores />} />
              <Route path="scores/students/:userId" element={<StudentReport readonly />} />
              <Route path="focus-students" element={<ViewerFocusStudents />} />
              <Route path="courses/settings" element={<ViewerCourseSettings />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route element={<RequireStaff />}>
            <Route path="/console/reports/:id" element={<ReportGrade />} />
            <Route path="/console/checkoff" element={<Checkoff />} />
            <Route path="/console/checkoff-multi" element={<CheckoffMulti />} />
            <Route path="/console/checkoff/special" element={<SpecialDrawEditor />} />
            <Route path="/console/reports/:id/criteria/new" element={<ReportCriteria />} />
            <Route path="/console/criteria/:key/edit" element={<ReportCriteria />} />
            <Route path="/console/courses/new-account" element={<NewClassAccount />} />
            <Route path="/console" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="checkoff-queue" element={<CheckoffQueue />} />
            <Route path="checkoff-queue/new" element={<CheckoffQueueNew />} />
            <Route path="checkoff-queue/edit" element={<CheckoffQueueNew />} />
            <Route path="checkoff/cards" element={<CustomCards />} />
            <Route path="boards" element={<Boards />} />
            <Route path="boards/scan" element={<BoardScan />} />
            <Route path="experiments" element={<Experiments />} />
            <Route path="experiments/:id" element={<ExperimentDetail />} />
            <Route path="experiments/:id/xzzd-push" element={<XzzdPush />} />
            <Route path="remarks/experiments/:id" element={<ExperimentRemarks />} />
            <Route path="questions" element={<Questions />} />
            <Route path="questions/banks/new" element={<NewBank />} />
            <Route path="questions/banks/:id/manage" element={<BankManage />} />
            <Route path="questions/banks/:id" element={<BankDetail />} />
            <Route path="tag" element={<Tags />} />
            <Route path="tag/:id/questions" element={<TagDetail />} />
            <Route path="tag/:id/banks" element={<TagDetail />} />
            <Route path="reports" element={<Reports />} />
            <Route path="criteria" element={<CriteriaManage />} />
            <Route path="llm-connect" element={<LlmConnect />} />
            <Route path="more" element={<More />} />
            <Route path="scores" element={<Scores />} />
            <Route path="scores/students/:userId" element={<StudentReport />} />
            <Route path="scores/standalone" element={<ScoreEntry />} />
            <Route path="courses/settings" element={<CourseSettings />} />
            <Route path="courses/users/new" element={<AddCourseUser />} />
            <Route path="courses/sync-scores" element={<XzzdScoreSync />} />
            <Route path="courses/new" element={<NewCourse />} />
            <Route path="courses/checkpoints" element={<Checkpoints />} />
            <Route path="courses/focus-students" element={<FocusStudents />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          </Route>
        </Route>
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsIndex />} />
          <Route path=":slug" element={<DocArticle />} />
        </Route>
        <Route element={<PublicLayout />}>
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/invite" element={<Invite />} />
          <Route path="/license" element={<Licenses />} />
          <Route path="/license/full" element={<LicensesFull />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/terms" element={<Terms />} />
        <Route path="/checkin" element={<Checkin />} />
        <Route path="/checkin/:token" element={<CheckinSession />} />
        <Route path="/student-preview/view" element={<StudentPreviewView />} />
      </Routes>
    </Suspense>
  )
}
