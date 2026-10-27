<script setup lang="ts">
import { computed } from 'vue'

import SpecialDrawFields from '@/components/special-draw/SpecialDrawFields.vue'
import { NODE_TYPE_LABEL } from '@/components/special-draw/special-draw-ui'
import type { QuestionBank } from '@/lib/api'
import {
  newSpecialDrawId,
  SPECIAL_DRAW_MAX_COUNT,
  type RatioBranch,
  type SpecialDrawNode,
} from '@/lib/special-draw'
import { UButton, UFormField, UInput, UInputNumber, USelect } from '@/ui'

const props = defineProps<{
  node: SpecialDrawNode
  nodes: SpecialDrawNode[]
  nodeIndex: Map<string, number>
  banks: QuestionBank[]
  bankMap: Map<string, QuestionBank>
}>()

const emit = defineEmits<{
  update: [updater: (node: SpecialDrawNode) => SpecialDrawNode]
  delete: []
}>()

type FieldValue = string | number | boolean | null

const startNode = computed(() => (props.node.type === 'start' ? props.node : null))
const drawNode = computed(() => (props.node.type === 'draw' ? props.node : null))
const ratioNode = computed(() => (props.node.type === 'ratio' ? props.node : null))
const countNode = computed(() => (props.node.type === 'count' ? props.node : null))
const flagNode = computed(() => (props.node.type === 'flag' ? props.node : null))
const setFlagNode = computed(() => (props.node.type === 'setFlag' ? props.node : null))
const toggleFlagNode = computed(() => (props.node.type === 'toggleFlag' ? props.node : null))
const endNode = computed(() => (props.node.type === 'end' ? props.node : null))

const bankItems = computed(() =>
  props.banks.map((bank) => ({
    label: `${bank.name}（${bank.questions.length} 题）`,
    value: bank.id,
  })),
)

const countOpItems = [
  { label: '大于', value: 'gt' },
  { label: '等于', value: 'eq' },
  { label: '小于', value: 'lt' },
]

const ratioBranches = computed(() => {
  const node = ratioNode.value
  if (!node) return []
  const total = node.branches.reduce((sum, item) => sum + item.weight, 0)
  return node.branches.map((branch) => ({
    ...branch,
    probability: total > 0 ? Math.round((branch.weight / total) * 100) : 0,
  }))
})

const bankQuestionCount = computed(() => {
  const node = drawNode.value
  if (!node) return 0
  return props.bankMap.get(node.bankId)?.questions.length ?? 0
})

function update(updater: (node: SpecialDrawNode) => SpecialDrawNode) {
  emit('update', updater)
}

function onBankChange(value: unknown) {
  if (value == null) return
  const bank = props.bankMap.get(String(value))
  if (!bank) return
  update((current) => {
    if (current.type !== 'draw') return current
    const maxCount = Math.max(1, bank.questions.length)
    return {
      ...current,
      bankId: bank.id,
      bankName: bank.name,
      min: Math.min(current.min, maxCount),
      max: Math.min(current.max, maxCount),
    }
  })
}

function onDrawMinChange(value: number | null) {
  const min = value ?? 1
  update((current) =>
    current.type === 'draw' ? { ...current, min, max: Math.max(min, current.max) } : current,
  )
}

function onDrawMaxChange(value: number | null) {
  update((current) =>
    current.type === 'draw'
      ? { ...current, max: Math.max(current.min, value ?? current.min) }
      : current,
  )
}

function onStartNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'start' ? { ...current, next } : current))
}

function onDrawNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'draw' ? { ...current, next } : current))
}

function onBranchLabelChange(branchId: string, value: unknown) {
  const label = typeof value === 'string' ? value : ''
  update((current) =>
    current.type === 'ratio'
      ? {
          ...current,
          branches: current.branches.map((item) =>
            item.id === branchId ? { ...item, label } : item,
          ),
        }
      : current,
  )
}

function onBranchWeightChange(branchId: string, value: number | null) {
  update((current) =>
    current.type === 'ratio'
      ? {
          ...current,
          branches: current.branches.map((item) =>
            item.id === branchId ? { ...item, weight: value ?? 0 } : item,
          ),
        }
      : current,
  )
}

function onBranchNext(branchId: string, value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) =>
    current.type === 'ratio'
      ? {
          ...current,
          branches: current.branches.map((item) =>
            item.id === branchId ? { ...item, next } : item,
          ),
        }
      : current,
  )
}

function onRemoveBranch(branchId: string) {
  update((current) =>
    current.type === 'ratio' && current.branches.length > 1
      ? {
          ...current,
          branches: current.branches.filter((item) => item.id !== branchId),
        }
      : current,
  )
}

function onAddBranch() {
  update((current) =>
    current.type === 'ratio'
      ? {
          ...current,
          branches: [
            ...current.branches,
            {
              id: newSpecialDrawId('branch'),
              label: `分支 ${current.branches.length + 1}`,
              weight: 50,
              next: null,
            } satisfies RatioBranch,
          ],
        }
      : current,
  )
}

function onCountOpChange(value: unknown) {
  if (value === 'gt' || value === 'eq' || value === 'lt') {
    update((current) => (current.type === 'count' ? { ...current, op: value } : current))
  }
}

function onCountValueChange(value: number | null) {
  update((current) =>
    current.type === 'count' ? { ...current, value: Math.max(0, value ?? 0) } : current,
  )
}

function onCountTrueNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'count' ? { ...current, trueNext: next } : current))
}

function onCountFalseNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'count' ? { ...current, falseNext: next } : current))
}

function onFlagChange(value: FieldValue) {
  const flag = Number(value)
  update((current) => (current.type === 'flag' ? { ...current, flag } : current))
}

function onFlagValueChange(value: FieldValue) {
  const next = value === true
  update((current) => (current.type === 'flag' ? { ...current, value: next } : current))
}

function onFlagTrueNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'flag' ? { ...current, trueNext: next } : current))
}

function onFlagFalseNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'flag' ? { ...current, falseNext: next } : current))
}

function onSetFlagChange(value: FieldValue) {
  const flag = Number(value)
  update((current) => (current.type === 'setFlag' ? { ...current, flag } : current))
}

function onSetFlagValueChange(value: FieldValue) {
  const next = value === true
  update((current) => (current.type === 'setFlag' ? { ...current, value: next } : current))
}

function onSetFlagNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'setFlag' ? { ...current, next } : current))
}

function onToggleFlagChange(value: FieldValue) {
  const flag = Number(value)
  update((current) => (current.type === 'toggleFlag' ? { ...current, flag } : current))
}

function onToggleFlagNext(value: FieldValue) {
  const next = typeof value === 'string' ? value : null
  update((current) => (current.type === 'toggleFlag' ? { ...current, next } : current))
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <span class="text-xs font-bold text-highlighted">{{ NODE_TYPE_LABEL[node.type] }}</span>
      <div class="ml-auto flex items-center gap-1">
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="删除节点"
          :disabled="node.type === 'start'"
          @click="emit('delete')"
        />
      </div>
    </div>

    <div v-if="startNode" class="flex flex-col gap-3">
      <p class="text-xs text-muted">固定开始节点，不可删除。</p>
      <UFormField label="下一步">
        <SpecialDrawFields
          kind="node"
          label="开始后的下一步"
          :value="startNode.next"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="startNode.id"
          @change="onStartNext"
        />
      </UFormField>
    </div>

    <div v-if="drawNode" class="flex flex-col gap-3">
      <UFormField label="题目集">
        <USelect
          aria-label="抽题题目集"
          placeholder="选择题目集"
          :model-value="drawNode.bankId"
          :items="bankItems"
          class="w-full"
          @update:model-value="onBankChange"
        />
        <div class="mt-1 text-[11px] text-muted">{{ bankQuestionCount }} 题可用</div>
      </UFormField>

      <div class="grid grid-cols-2 gap-2">
        <UFormField label="最少题数">
          <UInputNumber
            aria-label="最少抽取题数"
            :min="1"
            :max="Math.max(1, bankQuestionCount || 1)"
            :model-value="drawNode.min"
            @update:model-value="onDrawMinChange"
          />
        </UFormField>
        <UFormField label="最多题数">
          <UInputNumber
            aria-label="最多抽取题数"
            :min="drawNode.min"
            :max="Math.max(drawNode.min, bankQuestionCount || drawNode.min)"
            :model-value="drawNode.max"
            @update:model-value="onDrawMaxChange"
          />
        </UFormField>
      </div>

      <UFormField label="下一步">
        <SpecialDrawFields
          kind="node"
          label="抽题后的下一步"
          :value="drawNode.next"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="drawNode.id"
          @change="onDrawNext"
        />
      </UFormField>
    </div>

    <div v-if="ratioNode" class="flex flex-col gap-2">
      <div
        v-for="branch in ratioBranches"
        :key="branch.id"
        class="flex flex-col gap-2 rounded-xl border border-default bg-elevated/50 p-2"
      >
        <div class="flex items-end gap-2">
          <UFormField label="分支名称" class="min-w-0 flex-1">
            <UInput
              aria-label="分支名称"
              :model-value="branch.label"
              @update:model-value="(value) => onBranchLabelChange(branch.id, value)"
            />
          </UFormField>
          <UFormField :label="`权重 · ${branch.probability}%`">
            <UInputNumber
              aria-label="分支权重"
              :min="0"
              :max="100"
              class="w-24"
              :model-value="branch.weight"
              @update:model-value="(value) => onBranchWeightChange(branch.id, value)"
            />
          </UFormField>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="删除分支"
            :disabled="ratioNode.branches.length <= 1"
            @click="onRemoveBranch(branch.id)"
          />
        </div>
        <UFormField label="下一步">
          <SpecialDrawFields
            kind="node"
            label="分支下一步"
            :value="branch.next"
            :nodes="nodes"
            :node-index="nodeIndex"
            :exclude-id="ratioNode.id"
            @change="(value) => onBranchNext(branch.id, value)"
          />
        </UFormField>
      </div>
      <UButton
        icon="i-lucide-plus"
        size="sm"
        variant="soft"
        class="self-start"
        @click="onAddBranch"
      >
        添加分支
      </UButton>
      <p class="text-[11px] text-muted">权重会按总和归一化为实际概率。</p>
    </div>

    <div v-if="countNode" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <UFormField label="比较方式">
          <USelect
            aria-label="比较方式"
            :model-value="countNode.op"
            :items="countOpItems"
            class="w-full"
            @update:model-value="onCountOpChange"
          />
        </UFormField>
        <UFormField label="比较值 Y">
          <UInputNumber
            aria-label="比较值"
            :min="0"
            :max="SPECIAL_DRAW_MAX_COUNT"
            :model-value="countNode.value"
            @update:model-value="onCountValueChange"
          />
        </UFormField>
      </div>
      <UFormField label="条件成立">
        <SpecialDrawFields
          kind="node"
          label="条件成立下一步"
          :value="countNode.trueNext"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="countNode.id"
          @change="onCountTrueNext"
        />
      </UFormField>
      <UFormField label="条件不成立">
        <SpecialDrawFields
          kind="node"
          label="条件不成立下一步"
          :value="countNode.falseNext"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="countNode.id"
          @change="onCountFalseNext"
        />
      </UFormField>
      <p class="text-[11px] text-muted">数量取最近一次抽题节点实际抽到的题数。</p>
    </div>

    <div v-if="flagNode" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Flag">
          <SpecialDrawFields
            kind="flag"
            label="条件 Flag"
            :value="flagNode.flag"
            @change="onFlagChange"
          />
        </UFormField>
        <UFormField label="期望值">
          <SpecialDrawFields
            kind="boolean"
            label="Flag 期望值"
            :value="flagNode.value"
            true-label="为真"
            false-label="为假"
            @change="onFlagValueChange"
          />
        </UFormField>
      </div>
      <UFormField label="条件成立">
        <SpecialDrawFields
          kind="node"
          label="条件成立下一步"
          :value="flagNode.trueNext"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="flagNode.id"
          @change="onFlagTrueNext"
        />
      </UFormField>
      <UFormField label="条件不成立">
        <SpecialDrawFields
          kind="node"
          label="条件不成立下一步"
          :value="flagNode.falseNext"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="flagNode.id"
          @change="onFlagFalseNext"
        />
      </UFormField>
    </div>

    <div v-if="setFlagNode" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Flag">
          <SpecialDrawFields
            kind="flag"
            label="设置 Flag"
            :value="setFlagNode.flag"
            @change="onSetFlagChange"
          />
        </UFormField>
        <UFormField label="设为">
          <SpecialDrawFields
            kind="boolean"
            label="Flag 设置值"
            :value="setFlagNode.value"
            @change="onSetFlagValueChange"
          />
        </UFormField>
      </div>
      <UFormField label="下一步">
        <SpecialDrawFields
          kind="node"
          label="设置 Flag 后的下一步"
          :value="setFlagNode.next"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="setFlagNode.id"
          @change="onSetFlagNext"
        />
      </UFormField>
    </div>

    <div v-if="toggleFlagNode" class="flex flex-col gap-3">
      <UFormField label="Flag">
        <SpecialDrawFields
          kind="flag"
          label="翻转 Flag"
          :value="toggleFlagNode.flag"
          @change="onToggleFlagChange"
        />
      </UFormField>
      <UFormField label="下一步">
        <SpecialDrawFields
          kind="node"
          label="翻转 Flag 后的下一步"
          :value="toggleFlagNode.next"
          :nodes="nodes"
          :node-index="nodeIndex"
          :exclude-id="toggleFlagNode.id"
          @change="onToggleFlagNext"
        />
      </UFormField>
    </div>

    <p v-if="endNode" class="text-xs text-muted">流程在这里结束。</p>
  </div>
</template>
