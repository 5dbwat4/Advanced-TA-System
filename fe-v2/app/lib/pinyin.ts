import { pinyin } from 'pinyin-pro'

export type PinyinParts = { full: string; initials: string }

const cache = new Map<string, PinyinParts>()

/** 计算（并缓存）姓名的拼音全拼与首字母，均为小写、无分隔 */
export function pinyinIndex(name: string): PinyinParts {
  const cached = cache.get(name)
  if (cached) return cached

  const options = { toneType: 'none', nonZh: 'consecutive', separator: '' } as const
  const full = pinyin(name, { ...options, type: 'string' }).replace(/\s+/g, '').toLowerCase()
  const initials = pinyin(name, { ...options, type: 'string', pattern: 'first' })
    .replace(/\s+/g, '')
    .toLowerCase()

  const value = { full, initials }
  cache.set(name, value)
  return value
}

/** 姓名 / 学号 / 拼音 / 拼音首字母 模糊匹配（空查询视为匹配） */
export function matchStudent(query: string, student: { name: string; studentNo: string }): boolean {
  const raw = query.trim().toLowerCase()
  if (!raw) return true

  const compact = raw.replace(/[\s_-]+/g, '')
  if (compact.length === 0) return true
  if (student.studentNo.toLowerCase().includes(compact)) return true
  if (student.name.toLowerCase().includes(raw)) return true

  const { full, initials } = pinyinIndex(student.name)
  return full.includes(compact) || initials.includes(compact)
}
