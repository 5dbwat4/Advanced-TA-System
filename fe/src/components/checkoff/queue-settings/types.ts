import type { Key } from '@heroui/react'

export type StudentScope = 'all' | 'whitelist' | 'blacklist'
export type JumpMode = 'after3' | 'anywhere' | 'none'
export type StartModeChoice = 'now' | 'scheduled' | 'unchanged'

export const sectionClass = 'rounded-2xl border border-line bg-elevated p-5 md:p-6'
export const sectionTitleClass = 'text-sm font-bold text-fg'

export function keysToArray(value: Key | Key[] | null): string[] {
  if (value == null) return []
  return (Array.isArray(value) ? value : [value]).map(String)
}
