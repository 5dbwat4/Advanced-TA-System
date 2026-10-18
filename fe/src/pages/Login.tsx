import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel'
import { LoginPanel } from '@/components/auth/LoginPanel'

export default function Login() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <LoginBrandPanel />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <LoginPanel />
      </div>
    </div>
  )
}
