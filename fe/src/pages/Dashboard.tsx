import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import Activity from '~icons/lucide/activity'
import ArrowUpRight from '~icons/lucide/arrow-up-right'
import ClipboardCheck from '~icons/lucide/clipboard-check'
import ClipboardList from '~icons/lucide/clipboard-list'
import CircuitBoard from '~icons/lucide/circuit-board'
import FlaskConical from '~icons/lucide/flask-conical'
import ShieldCheck from '~icons/lucide/shield-check'
import Table from '~icons/lucide/table'
import { StatCard } from '@/components/console/StatCard'
import { Card } from '@/components/ui/Card'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const QUICK_ACTIONS = [
  {
    to: '/console/checkoff',
    icon: ClipboardCheck,
    title: '开始验收',
    desc: '抽题 · 评分 · 记录检查点',
    tone: 'from-brand-600 to-brand-700 shadow-brand-600/25',
  },
  {
    to: '/console/boards',
    icon: CircuitBoard,
    title: '开发板管理',
    desc: '借出 / 归还硬件开发板',
    tone: 'from-amber-500 to-amber-600 shadow-amber-600/25',
  },
  {
    to: '/console/scores',
    icon: Table,
    title: '分数和名单',
    desc: '功能测试 / 验收问答 / 报告分',
    tone: 'from-emerald-600 to-emerald-700 shadow-emerald-600/25',
  },
] as const

export default function Dashboard() {
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {greeting}，{user?.username ?? user?.name ?? '助教'}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">助教工作台 · 计算机系统课程</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} label="待验收" value={0} suffix="人" tone="brand" index={0} />
        <StatCard icon={CircuitBoard} label="未归还开发板" value={0} tone="amber" index={1} />
        <StatCard icon={FlaskConical} label="实验项目" value={0} tone="success" index={2} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card index={0} className="flex h-full items-center gap-5">
          <ProgressRing value={0} />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              验收进度
            </div>
            <div className="mt-1 text-lg font-bold">尚未开始</div>
            <div className="tabular mt-0.5 text-sm text-fg-muted">0 / 0 已验收</div>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.div
              key={action.to}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                to={action.to}
                className={cn(
                  'group flex items-center gap-4 rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg transition-shadow',
                  action.tone,
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <action.icon width={22} height={22} className="shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold">
                    {action.title}
                    <ArrowUpRight
                      width={14}
                      height={14}
                      className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </div>
                  <div className="truncate text-xs text-white/80">{action.desc}</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card index={0}>
          <div className="mb-4 flex items-center gap-2 text-sm font-bold">
            <Activity width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            最近动态
          </div>
          <div className="py-10 text-center text-sm text-fg-subtle">暂无动态</div>
        </Card>
        <Card index={1}>
          <div className="mb-4 flex items-center gap-2 text-sm font-bold">
            <ShieldCheck width={16} height={16} className="shrink-0 text-amber-500" />
            系统状态
          </div>
          <div className="py-10 text-center text-sm text-fg-subtle">一切正常</div>
        </Card>
      </div>
    </div>
  )
}
