import { Spinner } from '@heroui/react'
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { RedirectIfAuthed } from '@/components/auth/RedirectIfAuthed'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { PublicLayout } from '@/components/layout/PublicLayout'

const BankDetail = lazy(() => import('@/pages/BankDetail'))
const BankManage = lazy(() => import('@/pages/BankManage'))
const BoardScan = lazy(() => import('@/pages/BoardScan'))
const Boards = lazy(() => import('@/pages/Boards'))
const Changelog = lazy(() => import('@/pages/Changelog'))
const Checkin = lazy(() => import('@/pages/Checkin'))
const CheckinSession = lazy(() => import('@/pages/CheckinSession'))
const Checkoff = lazy(() => import('@/pages/Checkoff'))
const Checkpoints = lazy(() => import('@/pages/Checkpoints'))
const CourseSettings = lazy(() => import('@/pages/CourseSettings'))
const CriteriaManage = lazy(() => import('@/pages/CriteriaManage'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ExperimentDetail = lazy(() => import('@/pages/ExperimentDetail'))
const Experiments = lazy(() => import('@/pages/Experiments'))
const FocusStudents = lazy(() => import('@/pages/FocusStudents'))
const Licenses = lazy(() => import('@/pages/Licenses'))
const LicensesFull = lazy(() => import('@/pages/LicensesFull'))
const LlmConnect = lazy(() => import('@/pages/LlmConnect'))
const Login = lazy(() => import('@/pages/Login'))
const More = lazy(() => import('@/pages/More'))
const NewBank = lazy(() => import('@/pages/NewBank'))
const NewCourse = lazy(() => import('@/pages/NewCourse'))
const Questions = lazy(() => import('@/pages/Questions'))
const ReportCriteria = lazy(() => import('@/pages/ReportCriteria'))
const ReportGrade = lazy(() => import('@/pages/ReportGrade'))
const Reports = lazy(() => import('@/pages/Reports'))
const ScoreEntry = lazy(() => import('@/pages/ScoreEntry'))
const Scores = lazy(() => import('@/pages/Scores'))
const Settings = lazy(() => import('@/pages/Settings'))
const Setup = lazy(() => import('@/pages/Setup'))
const StudentPreviewView = lazy(() => import('@/pages/StudentPreviewView'))
const Terms = lazy(() => import('@/pages/Terms'))
const XzzdPush = lazy(() => import('@/pages/XzzdPush'))

function RouteLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/console" replace />} />
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<Login />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/setup" element={<Setup />} />
          <Route path="/console/reports/:id" element={<ReportGrade />} />
          <Route path="/console/reports/:id/criteria/new" element={<ReportCriteria />} />
          <Route path="/console/criteria/:key/edit" element={<ReportCriteria />} />
          <Route path="/console" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="checkoff" element={<Checkoff />} />
            <Route path="boards" element={<Boards />} />
            <Route path="boards/scan" element={<BoardScan />} />
            <Route path="experiments" element={<Experiments />} />
            <Route path="experiments/:id" element={<ExperimentDetail />} />
            <Route path="experiments/:id/xzzd-push" element={<XzzdPush />} />
            <Route path="questions" element={<Questions />} />
            <Route path="questions/banks/new" element={<NewBank />} />
            <Route path="questions/banks/:id/manage" element={<BankManage />} />
            <Route path="questions/banks/:id" element={<BankDetail />} />
            <Route path="reports" element={<Reports />} />
            <Route path="criteria" element={<CriteriaManage />} />
            <Route path="llm-connect" element={<LlmConnect />} />
            <Route path="more" element={<More />} />
            <Route path="scores" element={<Scores />} />
            <Route path="scores/standalone" element={<ScoreEntry />} />
            <Route path="courses/new" element={<NewCourse />} />
            <Route path="courses/settings" element={<CourseSettings />} />
            <Route path="courses/checkpoints" element={<Checkpoints />} />
            <Route path="courses/focus-students" element={<FocusStudents />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
        <Route element={<PublicLayout />}>
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/license" element={<Licenses />} />
          <Route path="/license/full" element={<LicensesFull />} />
        </Route>
        <Route path="/terms" element={<Terms />} />
        <Route path="/checkin" element={<Checkin />} />
        <Route path="/checkin/:token" element={<CheckinSession />} />
        <Route path="/student-preview/view" element={<StudentPreviewView />} />
        <Route path="*" element={<Navigate to="/console" replace />} />
      </Routes>
    </Suspense>
  )
}
