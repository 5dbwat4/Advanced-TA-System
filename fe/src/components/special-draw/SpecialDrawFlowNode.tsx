import { Handle, Position, type NodeProps } from '@xyflow/react'

import { NODE_TYPE_LABEL } from '@/components/special-draw/special-draw-ui'
import { cn } from '@/lib/utils'
import type { SpecialDrawFlowNode } from '@/lib/special-draw-flow'
import { outputPorts } from '@/lib/special-draw-flow'
import type { SpecialDrawNode } from '@/lib/special-draw'

const OP_LABEL = { gt: '大于', eq: '等于', lt: '小于' } as const

function nodeSummary(node: SpecialDrawNode): string {
  if (node.type === 'start') return '流程开始'
  if (node.type === 'draw') {
    return `${node.bankName || '未选择题目集'} · ${node.min}~${node.max} 题`
  }
  if (node.type === 'ratio') {
    const total = node.branches.reduce((sum, branch) => sum + branch.weight, 0)
    return node.branches
      .map((branch) => `${branch.label} ${total > 0 ? Math.round((branch.weight / total) * 100) : 0}%`)
      .join(' · ')
  }
  if (node.type === 'count') return `前一步 ${OP_LABEL[node.op]} ${node.value} 题`
  if (node.type === 'flag') return `flag ${node.flag} ${node.value ? '为真' : '为假'}`
  if (node.type === 'setFlag') return `flag ${node.flag} = ${node.value}`
  if (node.type === 'toggleFlag') return `翻转 flag ${node.flag}`
  return '流程结束'
}

export function SpecialDrawFlowNodeCard({ data, selected }: NodeProps<SpecialDrawFlowNode>) {
  const { node, index } = data
  const ports = outputPorts(node)
  const isStart = node.type === 'start'
  const isDraw = node.type === 'draw'

  return (
    <div
      className={cn(
        'w-fit min-w-[220px] max-w-[360px] rounded-2xl border bg-elevated shadow-sm transition-shadow',
        selected
          ? 'border-brand-500 shadow-lg shadow-brand-500/10'
          : isDraw
            ? 'border-amber-500/45'
            : 'border-line',
        isDraw && 'bg-amber-500/[0.035]',
      )}
    >
      {!isStart && (
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          style={{ left: -6, top: 22 }}
          className="!h-3 !w-3 !border-2 !border-line !bg-elevated"
        />
      )}
      <div
        className={cn(
          'rounded-t-2xl border-b border-line px-3 py-2',
          isDraw ? 'bg-amber-500/10' : 'bg-sunken/60',
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'tabular flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-bold',
              isDraw
                ? 'bg-gradient-to-br from-amber-500/25 to-orange-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300',
            )}
          >
            #{index + 1}
          </span>
          <span className="text-xs font-bold text-fg">{NODE_TYPE_LABEL[node.type]}</span>
        </div>
      </div>
      <div className="px-3 py-2">
        {isDraw ? (
          <p className="text-[11px] leading-relaxed text-fg-muted">
            在 <strong className="font-semibold text-fg">{node.bankName || '未选择题目集'}</strong> 中
            随机抽{' '}
            <strong className="font-semibold text-fg">
              {node.min === node.max ? node.min : `${node.min}~${node.max}`}
            </strong>{' '}
            题
          </p>
        ) : node.type === 'ratio' ? (
          <div className="space-y-1">
            {node.branches.map((branch) => {
              const total = node.branches.reduce((sum, item) => sum + item.weight, 0)
              const probability = total > 0 ? Math.round((branch.weight / total) * 100) : 0
              return (
                <div key={branch.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-fg-muted">
                    有{' '}
                    <strong className="font-semibold text-fg">{probability}%</strong>{' '}
                    的概率进入{' '}
                    <strong className="font-semibold text-fg">{branch.label}</strong>
                  </span>
                  <Handle
                    type="source"
                    id={`branch:${branch.id}`}
                    position={Position.Right}
                    style={{ position: 'relative', right: 'auto', top: 'auto', transform: 'none' }}
                    className="!h-3 !w-3 !border-2 !border-line !bg-elevated"
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-fg-muted">
            {nodeSummary(node)}
          </p>
        )}
        {node.type !== 'ratio' && ports.length > 0 && (
          <div className="mt-2 space-y-1">
            {ports.map((port) => (
              <div key={port.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-medium text-fg-subtle">{port.label}</span>
                <Handle
                  type="source"
                  id={port.key}
                  position={Position.Right}
                  style={{ position: 'relative', right: 'auto', top: 'auto', transform: 'none' }}
                  className="!h-3 !w-3 !border-2 !border-line !bg-elevated"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
