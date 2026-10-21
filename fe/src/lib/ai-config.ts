import { useEffect } from 'react'
import { create } from 'zustand'

export type AiConfig = {
  apiKey: string
  baseUrl: string
  model: string
  demoMode: boolean
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiKey: '',
  baseUrl: '',
  model: '',
  demoMode: true,
}

const storageKey = (userId: string) => `tasaas.ai.${userId}`

function normalize(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readAiConfig(userId: string | null | undefined): AiConfig {
  if (!userId) return DEFAULT_AI_CONFIG
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_AI_CONFIG
    const value = JSON.parse(raw) as Partial<AiConfig> | null
    return {
      apiKey: normalize(value?.apiKey),
      baseUrl: normalize(value?.baseUrl),
      model: normalize(value?.model),
      demoMode: value?.demoMode !== false,
    }
  } catch {
    return DEFAULT_AI_CONFIG
  }
}

type AiConfigStore = {
  userId: string | null
  config: AiConfig
  load: (userId: string | null) => void
  save: (userId: string | null, config: AiConfig) => void
}

export const useAiConfigStore = create<AiConfigStore>((set) => ({
  userId: null,
  config: DEFAULT_AI_CONFIG,
  load: (userId) => set({ userId, config: readAiConfig(userId) }),
  save: (userId, config) => {
    if (userId) {
      try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(config))
      } catch {
        // localStorage 不可用时仅保留内存态
      }
    }
    set({ userId, config })
  },
}))

export function useAiConfig(userId: string | null | undefined): AiConfig {
  const loadedUserId = useAiConfigStore((state) => state.userId)
  const config = useAiConfigStore((state) => state.config)
  const load = useAiConfigStore((state) => state.load)

  useEffect(() => {
    if (!userId) return
    if (loadedUserId !== userId) load(userId)
  }, [userId, loadedUserId, load])

  return userId && loadedUserId === userId ? config : DEFAULT_AI_CONFIG
}
