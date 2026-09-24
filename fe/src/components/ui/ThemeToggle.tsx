import { AnimatePresence, motion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/ui/Icon'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label="切换主题"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mounted ? (isDark ? 'moon' : 'sun') : 'placeholder'}
          initial={{ opacity: 0, rotate: -90, y: 6 }}
          animate={{ opacity: 1, rotate: 0, y: 0 }}
          exit={{ opacity: 0, rotate: 90, y: -6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          className="flex"
        >
          <Icon icon={isDark ? 'lucide:moon' : 'lucide:sun'} width={18} />
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
