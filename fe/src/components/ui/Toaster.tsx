import { useTheme } from 'next-themes'
import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <SonnerToaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'var(--glass)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--line)',
          color: 'var(--fg)',
        },
      }}
    />
  )
}
