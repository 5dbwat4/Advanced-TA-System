import type { ReactNode } from 'react'

import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel'

/** Shared two-column layout for the login pages. */
export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <LoginBrandPanel />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
