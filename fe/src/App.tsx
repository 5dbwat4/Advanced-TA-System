import { Navigate, Route, Routes } from 'react-router-dom'

import { RedirectIfAuthed } from '@/components/auth/RedirectIfAuthed'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import Boards from '@/pages/Boards'
import BoardScan from '@/pages/BoardScan'
import Checkin from '@/pages/Checkin'
import CheckinSession from '@/pages/CheckinSession'
import Checkoff from '@/pages/Checkoff'
import Checkpoints from '@/pages/Checkpoints'
import CourseSettings from '@/pages/CourseSettings'
import Dashboard from '@/pages/Dashboard'
import ExperimentDetail from '@/pages/ExperimentDetail'
import Experiments from '@/pages/Experiments'
import FocusStudents from '@/pages/FocusStudents'
import Login from '@/pages/Login'
import NewCourse from '@/pages/NewCourse'
import LlmConnect from '@/pages/LlmConnect'
import More from '@/pages/More'
import Questions from '@/pages/Questions'
import Reports from '@/pages/Reports'
import Scores from '@/pages/Scores'
import Settings from '@/pages/Settings'
import Setup from '@/pages/Setup'
import StudentPreviewView from '@/pages/StudentPreviewView'
import Terms from '@/pages/Terms'
import XzzdPush from '@/pages/XzzdPush'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/console" replace />} />
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/setup" element={<Setup />} />
        <Route path="/console" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="checkoff" element={<Checkoff />} />
          <Route path="boards" element={<Boards />} />
          <Route path="boards/scan" element={<BoardScan />} />
          <Route path="experiments" element={<Experiments />} />
          <Route path="experiments/:id" element={<ExperimentDetail />} />
          <Route path="experiments/:id/xzzd-push" element={<XzzdPush />} />
          <Route path="questions" element={<Questions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="llm-connect" element={<LlmConnect />} />
          <Route path="more" element={<More />} />
          <Route path="scores" element={<Scores />} />
          <Route path="courses/new" element={<NewCourse />} />
          <Route path="courses/settings" element={<CourseSettings />} />
          <Route path="courses/checkpoints" element={<Checkpoints />} />
          <Route path="courses/focus-students" element={<FocusStudents />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="/terms" element={<Terms />} />
      <Route path="/checkin" element={<Checkin />} />
      <Route path="/checkin/:token" element={<CheckinSession />} />
      <Route path="/student-preview/view" element={<StudentPreviewView />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Routes>
  )
}
