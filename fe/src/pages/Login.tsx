import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel'
import { LoginPanel } from '@/components/auth/LoginPanel'

export default function Login() {
  return (
    <div className="flex min-h-screen">
      <LoginBrandPanel />
      <LoginPanel />
    </div>
  )
}
