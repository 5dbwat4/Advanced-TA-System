import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // ignore
  }
  return 'system'
}

const mode = ref<ThemeMode>(readTheme())
const systemDark = ref(media?.matches ?? false)

function applyTheme() {
  if (typeof document === 'undefined') return
  const dark = mode.value === 'dark' || (mode.value === 'system' && systemDark.value)
  document.documentElement.classList.toggle('dark', dark)
}

media?.addEventListener('change', (event) => {
  systemDark.value = event.matches
  applyTheme()
})

applyTheme()

export function useTheme() {
  const isDark = computed(() => mode.value === 'dark' || (mode.value === 'system' && systemDark.value))

  function setTheme(next: ThemeMode) {
    mode.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    applyTheme()
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { mode, isDark, setTheme, toggleTheme }
}
