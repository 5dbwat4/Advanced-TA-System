import type { IconComponent } from '@/lib/icon'

export type NavItem = {
  to: string
  label: string
  icon: IconComponent
  end?: boolean
  /** 是否固定展示在移动端底部导航（其余入口收进「更多」） */
  mobile?: boolean
  /** 「更多」页中的说明文字 */
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/console', label: '总览', icon: 'i-lucide-layout-dashboard', end: true, mobile: true, description: '工作台总览与快捷入口' },
  { to: '/console/checkoff', label: '验收', icon: 'i-lucide-clipboard-check', description: '抽题 · 评分 · 记录检查点' },
  { to: '/console/experiments', label: '实验', icon: 'i-lucide-flask-conical', mobile: true, description: '创建实验并绑定题目集' },
  { to: '/console/questions', label: '题库', icon: 'i-lucide-notebook-text', mobile: true, description: '题目与题目集管理' },
  { to: '/console/reports', label: '实验报告', icon: 'i-lucide-file-text', mobile: true, description: '报告批阅与查看' },
  { to: '/console/scores', label: '分数和名单', icon: 'i-lucide-table', mobile: true, description: '成绩录入与学生名单同步' },
  { to: '/console/courses/settings', label: '课程设置', icon: 'i-lucide-book-open', description: '课程信息与 Checkpoint 设置' },
  { to: '/console/settings', label: '设置', icon: 'i-lucide-settings-2', description: '账号、偏好与系统设置' },
]

/** 移动端底部导航固定条目 */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.mobile)

/** 「更多」页路径 */
export const MORE_PATH = '/console/more'

/** 属于「更多」的页面路径（不在底部导航中的入口，用于高亮「更多」标签） */
const MORE_SECTION_PATHS = [
  '/console/checkoff',
  '/console/boards',
  '/console/courses',
  '/console/settings',
  MORE_PATH,
]

export function isMoreSection(pathname: string): boolean {
  return MORE_SECTION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/** 当前路径是否命中某导航项（用于「更多」页高亮） */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`)
}
