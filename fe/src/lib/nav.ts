import type { IconComponent } from '@/lib/icon'

import BookOpen from '~icons/lucide/book-open'
import Bot from '~icons/lucide/bot'
import CircuitBoard from '~icons/lucide/circuit-board'
import ClipboardCheck from '~icons/lucide/clipboard-check'
import FileText from '~icons/lucide/file-text'
import FlaskConical from '~icons/lucide/flask-conical'
import LayoutDashboard from '~icons/lucide/layout-dashboard'
import NotebookText from '~icons/lucide/notebook-text'
import Settings2 from '~icons/lucide/settings-2'
import Table from '~icons/lucide/table'

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
  { to: '/console', label: '总览', icon: LayoutDashboard, end: true, mobile: true, description: '工作台总览与快捷入口' },
  { to: '/console/checkoff', label: '验收', icon: ClipboardCheck, description: '抽题 · 评分 · 记录检查点' },
  { to: '/console/boards', label: '开发板', icon: CircuitBoard, description: '借出 / 归还硬件开发板' },
  { to: '/console/experiments', label: '实验', icon: FlaskConical, mobile: true, description: '创建实验并绑定题目集' },
  { to: '/console/questions', label: '题库', icon: NotebookText, mobile: true, description: '题目与题目集管理' },
  { to: '/console/reports', label: '实验报告', icon: FileText, mobile: true, description: '报告批阅与查看' },
  { to: '/console/scores', label: '分数和名单', icon: Table, mobile: true, description: '成绩录入与学生名单同步' },
  { to: '/console/llm-connect', label: 'MCP & Skills', icon: Bot, description: '连接你的 Agent' },
  { to: '/console/courses/settings', label: '课程设置', icon: BookOpen, description: '课程信息与 Checkpoint 设置' },
  { to: '/console/settings', label: '设置', icon: Settings2, description: '账号、偏好与系统设置' },
]

/** 移动端底部导航固定条目 */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.mobile)

/** 「更多」页路径 */
export const MORE_PATH = '/console/more'

/** 属于「更多」的页面路径（不在底部导航中的入口，用于高亮「更多」标签） */
const MORE_SECTION_PATHS = [
  '/console/checkoff',
  '/console/boards',
  '/console/llm-connect',
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
