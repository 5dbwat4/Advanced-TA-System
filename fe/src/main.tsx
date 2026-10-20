import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toast } from '@heroui/react'
import { ThemeProvider } from 'next-themes'

import App from '@/App'
import { ServiceWorkerUpdate } from '@/components/ui/ServiceWorkerUpdate'
import { Toaster } from '@/components/ui/Toaster'
import { AuthProvider } from '@/lib/auth'
import { initSentry } from '@/lib/sentry'
import '@/index.css'
import '@uiw/react-md-editor/markdown-editor.css'

initSentry()

function AppCrash({ eventId, resetError }: { eventId: string; resetError: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6 text-fg">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">页面出错了</h1>
        <p className="mt-2 text-sm text-fg-muted">错误已自动上报。你可以刷新页面重试。</p>
        {eventId ? <p className="mt-3 break-all font-mono text-xs text-fg-subtle">事件 ID：{eventId}</p> : null}
        <button
          type="button"
          onClick={() => {
            resetError()
            window.location.reload()
          }}
          className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          刷新页面
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ eventId, resetError }) => <AppCrash eventId={eventId} resetError={resetError} />}
    >
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <BrowserRouter>
          <AuthProvider>
            <div className="aurora" aria-hidden />
            <div className="grid-overlay" aria-hidden />
            <App />
            <Toaster />
            <ServiceWorkerUpdate />
            <Toast.Provider placement="top" />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
