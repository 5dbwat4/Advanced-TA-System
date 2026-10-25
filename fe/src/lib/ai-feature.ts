function readFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

export const AI_ENABLED = readFlag(import.meta.env.VITE_ENABLE_AI)
