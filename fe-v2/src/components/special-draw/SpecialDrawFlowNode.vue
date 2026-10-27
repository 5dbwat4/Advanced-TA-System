<script setup lang="ts">
import { computed } from 'vue'

import { Handle, Position } from '@vue-flow/core'

import { NODE_TYPE_LABEL } from '@/components/special-draw/special-draw-ui'
import type { RatioBranch, SpecialDrawNode } from '@/lib/special-draw'
import {
  outputPorts,
  type SpecialDrawFlowData,
} from '@/lib/special-draw-flow'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    data: SpecialDrawFlowData
    selected?: boolean
  }>(),
  { selected: false },
)

const OP_LABEL = { gt: '大于', eq: '等于', lt: '小于' } as const

const inlineHandleStyle = {
  position: 'relative',
  right: 'auto',
  top: 'auto',
  transform: 'none',
} as const

function nodeSummary(node: SpecialDrawNode): string {
  if (node.type === 'start') return '流程开始'
  if (node.type === 'draw') {
    return `${node.bankName || '未选择题目集'} · ${node.min}~${node.max} 题`
  }
  if (node.type === 'ratio') {
    const total = node.branches.reduce((sum, branch) => sum + branch.weight, 0)
    return node.branches
      .map(
        (branch) =>
          `${branch.label} ${total > 0 ? Math.round((branch.weight / total) * 100) : 0}%`,
      )
      .join(' · ')
  }
  if (node.type === 'count') return `前一步 ${OP_LABEL[node.op]} ${node.value} 题`
  if (node.type === 'flag') return `flag ${node.flag} ${node.value ? '为真' : '为假'}`
  if (node.type === 'setFlag') return `flag ${node.flag} = ${node.value}`
  if (node.type === 'toggleFlag') return `翻转 flag ${node.flag}`
  return '流程结束'
}

const node = computed(() => props.data.node)
const index = computed(() => props.data.index)
const ports = computed(() => outputPorts(props.data.node))
const summary = computed(() => nodeSummary(props.data.node))
const isStart = computed(() => props.data.node.type === 'start')
const isDraw = computed(() => props.data.node.type === 'draw')
const isRatio = computed(() => props.data.node.type === 'ratio')

const drawBankName = computed(() =>
  props.data.node.type === 'draw' ? props.data.node.bankName || '未选择题目集' : '',
)

const drawRange = computed(() => {
  const current = props.data.node
  if (current.type !== 'draw') return ''
  return current.min === current.max ? String(current.min) : `${current.min}~${current.max}`
})

const ratioBranches = computed<(RatioBranch & { probability: number })[]>(() => {
  const current = props.data.node
  if (current.type !== 'ratio') return []
  const total = current.branches.reduce((sum, branch) => sum + branch.weight, 0)
  return current.branches.map((branch) => ({
    ...branch,
    probability: total > 0 ? Math.round((branch.weight / total) * 100) : 0,
  }))
})
</script>

<template>
  <div
    :class="
      cn(
        'w-fit min-w-[220px] max-w-[360px] rounded-2xl border bg-elevated shadow-sm transition-shadow',
        selected
          ? 'border-brand-500 shadow-lg shadow-brand-500/10'
          : isDraw
            ? 'border-amber-500/45'
            : 'border-line',
        isDraw && 'bg-amber-500/[0.035]',
      )
    "
  >
    <Handle
      v-if="!isStart"
      id="in"
      type="target"
      :position="Position.Left"
      :style="{ left: '-6px', top: '22px' }"
      class="!h-3 !w-3 !border-2 !border-line !bg-elevated"
    />
    <div
      :class="
        cn(
          'rounded-t-2xl border-b border-line px-3 py-2',
          isDraw ? 'bg-amber-500/10' : 'bg-sunken/60',
        )
      "
    >
      <div class="flex items-center gap-2">
        <span
          :class="
            cn(
              'tabular flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-bold',
              isDraw
                ? 'bg-gradient-to-br from-amber-500/25 to-orange-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300',
            )
          "
        >
          #{{ index + 1 }}
        </span>
        <span class="text-xs font-bold text-fg">{{ NODE_TYPE_LABEL[node.type] }}</span>
      </div>
    </div>
    <div class="px-3 py-2">
      <p v-if="isDraw" class="text-[11px] leading-relaxed text-fg-muted">
        在 <strong class="font-semibold text-fg">{{ drawBankName }}</strong> 中 随机抽
        <strong class="font-semibold text-fg">{{ drawRange }}</strong> 题
      </p>
      <div v-else-if="isRatio" class="space-y-1">
        <div
          v-for="branch in ratioBranches"
          :key="branch.id"
          class="flex items-center justify-between gap-2"
        >
          <span class="min-w-0 flex-1 text-[11px] leading-relaxed text-fg-muted">
            有 <strong class="font-semibold text-fg">{{ branch.probability }}%</strong> 的概率进入
            <strong class="font-semibold text-fg">{{ branch.label }}</strong>
          </span>
          <Handle
            :id="`branch:${branch.id}`"
            type="source"
            :position="Position.Right"
            :style="inlineHandleStyle"
            class="!h-3 !w-3 !border-2 !border-line !bg-elevated"
          />
        </div>
      </div>
      <p v-else class="line-clamp-2 text-[11px] leading-relaxed text-fg-muted">
        {{ summary }}
      </p>
      <div v-if="node.type !== 'ratio' && ports.length > 0" class="mt-2 space-y-1">
        <div v-for="port in ports" :key="port.key" class="flex items-center justify-between gap-2">
          <span class="truncate text-[10px] font-medium text-fg-subtle">{{ port.label }}</span>
          <Handle
            :id="port.key"
            type="source"
            :position="Position.Right"
            :style="inlineHandleStyle"
            class="!h-3 !w-3 !border-2 !border-line !bg-elevated"
          />
        </div>
      </div>
    </div>
  </div>
</template>
