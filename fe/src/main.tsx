import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toast } from '@heroui/react'
import { ThemeProvider } from 'next-themes'

import App from '@/App'
import { Toaster } from '@/components/ui/Toaster'
import { AuthProvider } from '@/lib/auth'
import '@/index.css'
import '@uiw/react-md-editor/markdown-editor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <BrowserRouter>
        <AuthProvider>
          <div className="aurora" aria-hidden />
          <div className="grid-overlay" aria-hidden />
          <App />
          <Toaster />
          <Toast.Provider placement="top" />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
