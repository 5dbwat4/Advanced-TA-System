<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'

import SpecialDrawGraph from '@/components/special-draw/SpecialDrawGraph.vue'
import SpecialDrawInspector from '@/components/special-draw/SpecialDrawInspector.vue'
import SpecialDrawPreview from '@/components/special-draw/SpecialDrawPreview.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { listBanks, type QuestionBank } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import {
  clearSpecialDrawMachine,
  createEmptySpecialDrawMachine,
  createSpecialDrawNode,
  createSpecialDrawPayload,
  loadSpecialDrawBanks,
  loadSpecialDrawMachine,
  parseSpecialDrawPayload,
  runSpecialDrawMachine,
  saveSpecialDrawMachine,
  SPECIAL_DRAW_STORAGE_KEY,
  validateSpecialDrawMachine,
  type SpecialDrawMachine,
  type SpecialDrawNode,
  type SpecialDrawNodeType,
  type SpecialDrawRunResult,
} from '@/lib/special-draw'
import { setNodePortTarget } from '@/lib/special-draw-flow'
import { findSpecialDrawPlacement, type LayoutRect } from '@/lib/special-draw-layout'
import { toast } from '@/lib/toast'
import { UAlert, UButton, UDropdownMenu, UIcon, UTextarea } from '@/ui'

function detachNode(node: SpecialDrawNode, removedId: string): SpecialDrawNode {
  if (
    node.type === 'start' ||
    node.type === 'draw' ||
    node.type === 'setFlag' ||
    node.type === 'toggleFlag'
  ) {
    return node.next === removedId ? { ...node, next: null } : node
  }
  if (node.type === 'ratio') {
    return {
      ...node,
      branches: node.branches.map((branch) =>
        branch.next === removedId ? { ...branch, next: null } : branch,
      ),
    }
  }
  if (node.type === 'count' || node.type === 'flag') {
    return {
      ...node,
      trueNext: node.trueNext === removedId ? null : node.trueNext,
      falseNext: node.falseNext === removedId ? null : node.falseNext,
    }
  }
  return node
}

function startNodeId(machine: SpecialDrawMachine): string | null {
  return machine.nodes.find((node) => node.type === 'start')?.id ?? machine.nodes[0]?.id ?? null
}

const initialMachine = loadSpecialDrawMachine() ?? createEmptySpecialDrawMachine()

const banks = ref<QuestionBank[]>([])
const banksLoading = ref(true)
const machine = ref<SpecialDrawMachine>(initialMachine)
const selectedNodeId = ref<string | null>(startNodeId(initialMachine))
const payloadText = ref('')
const testing = ref(false)
const testResult = ref<SpecialDrawRunResult | null>(null)

let cancelled = false

onMounted(() => {
  listBanks()
    .then((res) => {
      if (!cancelled) banks.value = res.banks
    })
    .catch((error) => {
      if (!cancelled) toast.error(getErrorMessage(error, '加载题目集失败'))
    })
    .finally(() => {
      if (!cancelled) banksLoading.value = false
    })

  window.addEventListener('storage', onStorage)
})

onUnmounted(() => {
  cancelled = true
  window.removeEventListener('storage', onStorage)
})

function onStorage(event: StorageEvent) {
  if (event.key !== SPECIAL_DRAW_STORAGE_KEY) return
  const next = loadSpecialDrawMachine() ?? createEmptySpecialDrawMachine()
  machine.value = next
  selectedNodeId.value = startNodeId(next)
}

const bankMap = computed(() => new Map(banks.value.map((bank) => [bank.id, bank])))
const bankMeta = computed(() =>
  banks.value.map((bank) => ({ id: bank.id, name: bank.name, count: bank.questions.length })),
)

const normalizedMachine = computed<SpecialDrawMachine>(() => ({
  ...machine.value,
  nodes: machine.value.nodes.map((node) =>
    node.type === 'draw'
      ? { ...node, bankName: bankMap.value.get(node.bankId)?.name ?? node.bankName }
      : node,
  ),
}))

const validationError = computed(() =>
  validateSpecialDrawMachine(normalizedMachine.value, bankMeta.value),
)

const nodeIndex = computed(
  () => new Map(machine.value.nodes.map((node, index) => [node.id, index])),
)

const selectedNode = computed(
  () => machine.value.nodes.find((node) => node.id === selectedNodeId.value) ?? null,
)

const activeFlags = computed(() => {
  const result = testResult.value
  if (!result) return []
  return result.flags.flatMap((value, index) => (value ? [index] : []))
})

const addMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: '抽题', icon: 'i-lucide-dices', onSelect: () => addNode('draw') },
    { label: '抽取比例', icon: 'i-lucide-git-branch', onSelect: () => addNode('ratio') },
    { label: '数量条件', icon: 'i-lucide-git-branch', onSelect: () => addNode('count') },
    { label: 'Flag 条件', icon: 'i-lucide-flag', onSelect: () => addNode('flag') },
    { label: '设置 Flag', icon: 'i-lucide-flag-off', onSelect: () => addNode('setFlag') },
    { label: '翻转 Flag', icon: 'i-lucide-toggle-left', onSelect: () => addNode('toggleFlag') },
    { label: '结束', icon: 'i-lucide-circle-stop', onSelect: () => addNode('end') },
  ],
])

function updateNode(id: string, updater: (node: SpecialDrawNode) => SpecialDrawNode) {
  machine.value = {
    ...machine.value,
    nodes: machine.value.nodes.map((node) => (node.id === id ? updater(node) : node)),
  }
}

function addNode(type: SpecialDrawNodeType) {
  const bank = banks.value.find((item) => item.questions.length > 0)
  const rects: LayoutRect[] = machine.value.nodes.map((node) => ({
    x: node.x,
    y: node.y,
    width: 280,
    height: 140,
  }))
  const innerCorner = findSpecialDrawPlacement(rects, { width: 360, height: 220 }, 60)
  const maxX = machine.value.nodes.reduce((max, node) => Math.max(max, node.x), 0)
  const position = innerCorner ?? {
    x: maxX + 340,
    y: 120 + (machine.value.nodes.length % 3) * 220,
  }

  const node = createSpecialDrawNode(
    type,
    bank ? { id: bank.id, name: bank.name, count: bank.questions.length } : undefined,
    position,
  )
  machine.value = { ...machine.value, nodes: [...machine.value.nodes, node] }
  selectedNodeId.value = node.id
}

function deleteNode(id: string) {
  const target = machine.value.nodes.find((node) => node.id === id)
  if (!target || target.type === 'start') {
    toast.error('开始节点不可删除')
    return
  }
  const nodes = machine.value.nodes
    .filter((node) => node.id !== id)
    .map((node) => detachNode(node, id))
  machine.value = { ...machine.value, nodes }
  if (selectedNodeId.value === id) selectedNodeId.value = null
  testResult.value = null
}

function handleInspectorUpdate(updater: (node: SpecialDrawNode) => SpecialDrawNode) {
  const node = selectedNode.value
  if (!node) return
  updateNode(node.id, updater)
}

function handleInspectorDelete() {
  const node = selectedNode.value
  if (node) deleteNode(node.id)
}

function moveNode(id: string, x: number, y: number) {
  updateNode(id, (node) => ({ ...node, x: Math.max(0, x), y: Math.max(0, y) }))
}

function connect(source: string, port: string, target: string) {
  if (source === target) {
    toast.error('不能连接到自身')
    return
  }
  updateNode(source, (node) => setNodePortTarget(node, port, target))
  testResult.value = null
}

function deleteEdge(source: string, port: string) {
  updateNode(source, (node) => setNodePortTarget(node, port, null))
  testResult.value = null
}

function save() {
  if (validationError.value) {
    toast.error(validationError.value)
    return
  }
  try {
    saveSpecialDrawMachine(normalizedMachine.value)
    toast.success('已保存到当前设备')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  }
}

async function test() {
  if (validationError.value) {
    toast.error(validationError.value)
    return
  }
  testing.value = true
  try {
    const specialBanks = await loadSpecialDrawBanks(normalizedMachine.value)
    const result = runSpecialDrawMachine(normalizedMachine.value, specialBanks)
    testResult.value = result
    if (result.error) toast.error(result.error)
    else toast.success(`试运行完成，共抽取 ${result.questions.length} 题`)
  } catch (error) {
    toast.error(getErrorMessage(error, '试运行失败'))
  } finally {
    testing.value = false
  }
}

async function exportPayload() {
  if (validationError.value) {
    toast.error(validationError.value)
    return
  }
  const payload = createSpecialDrawPayload(normalizedMachine.value)
  payloadText.value = payload
  let ok = false
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(payload)
      ok = true
    }
  } catch {
    ok = false
  }
  toast.success(ok ? 'payload 已复制' : 'payload 已生成，请手动复制')
}

function importPayload() {
  if (!payloadText.value.trim()) {
    toast.error('请先粘贴 payload')
    return
  }
  try {
    const next = parseSpecialDrawPayload(payloadText.value)
    const error = validateSpecialDrawMachine(next, bankMeta.value)
    if (error) throw new Error(error)
    machine.value = next
    selectedNodeId.value = startNodeId(next)
    testResult.value = null
    toast.success('payload 已导入')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导入失败')
  }
}

function clear() {
  clearSpecialDrawMachine()
  const next = createEmptySpecialDrawMachine()
  machine.value = next
  selectedNodeId.value = startNodeId(next)
  testResult.value = null
  payloadText.value = ''
  toast.success('已清除本地特殊抽题配置')
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl"
    >
      <RouterLink
        to="/console/checkoff"
        class="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
        返回验收
      </RouterLink>
      <div class="h-5 w-px bg-line" />
      <div class="min-w-0 flex-1 truncate text-sm font-bold">特殊的抽题方式</div>
      <span class="shrink-0 text-xs text-fg-subtle">
        {{ machine.nodes.length }} 节点 · 16 flags
      </span>
      <UButton color="neutral" variant="ghost" size="sm" @click="clear">清除</UButton>
      <UButton
        color="neutral"
        variant="soft"
        size="sm"
        :loading="testing"
        @click="test"
      >
        <UIcon name="i-lucide-play" class="size-3.5 shrink-0" />
        试运行
      </UButton>
      <UButton size="sm" @click="save">
        <UIcon name="i-lucide-save" class="size-3.5 shrink-0" />
        保存
      </UButton>
    </header>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside
        class="max-h-[45vh] w-full shrink-0 overflow-y-auto border-b border-line bg-elevated/40 p-4 lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r"
      >
        <div class="flex flex-col gap-4">
          <div v-if="banksLoading" class="flex items-center gap-2 text-xs text-fg-muted">
            <Spinner size="sm" />
            正在加载题目集…
          </div>

          <UAlert
            variant="subtle"
            v-if="!banksLoading && banks.length === 0"
            color="warning"
            title="还没有题目集，抽题节点无法配置。"
            icon="i-lucide-triangle-alert"
          />

          <UAlert
            variant="subtle"
            v-if="validationError"
            color="error"
            :description="validationError"
            icon="i-lucide-circle-alert"
          />

          <section class="flex flex-wrap items-center gap-2">
            <UDropdownMenu :items="addMenuItems" :content="{ align: 'start' }">
              <UButton color="neutral" variant="soft" size="sm">
                <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
                添加节点
              </UButton>
            </UDropdownMenu>
          </section>

          <section class="rounded-2xl border border-line bg-elevated p-3">
            <div class="mb-2 text-xs font-bold text-fg">节点设置</div>
            <SpecialDrawInspector
              v-if="selectedNode"
              :node="selectedNode"
              :nodes="machine.nodes"
              :node-index="nodeIndex"
              :banks="banks"
              :bank-map="bankMap"
              @update="handleInspectorUpdate"
              @delete="handleInspectorDelete"
            />
            <p v-else class="py-4 text-center text-xs text-fg-subtle">
              点击画布上的节点开始编辑
            </p>
          </section>

          <section v-if="testResult" class="rounded-2xl border border-line bg-elevated p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-fg">试运行结果</span>
              <span class="text-[11px] text-fg-muted">
                {{ testResult.questions.length }} 题 · 前一步 {{ testResult.lastDrawCount }} 题
              </span>
            </div>
            <div v-if="activeFlags.length > 0" class="mt-1 text-[11px] text-fg-muted">
              Flags: {{ activeFlags.map((flag) => `#${flag}`).join(' ') }}
            </div>
            <p v-if="testResult.error" class="mt-2 text-[11px] font-medium text-danger">
              {{ testResult.error }}
            </p>
            <div v-if="testResult.questions.length > 0" class="mt-2 space-y-1">
              <div
                v-for="(question, index) in testResult.questions"
                :key="question.id"
                class="rounded-lg border border-line bg-sunken px-2 py-1.5"
              >
                <div class="text-[10px] font-semibold text-fg-muted">第 {{ index + 1 }} 题</div>
                <div class="line-clamp-2 text-[11px] text-fg">{{ question.question }}</div>
              </div>
            </div>
            <div class="mt-2 space-y-1">
              <div
                v-for="(step, index) in testResult.trace"
                :key="`${step.nodeId}-${index}`"
                class="text-[10px] text-fg-subtle"
              >
                <span class="tabular mr-1 font-semibold text-fg-muted">{{ index + 1 }}.</span>
                {{ step.detail }}
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-line bg-elevated p-3">
            <div class="mb-2 text-xs font-bold text-fg">流程预览</div>
            <SpecialDrawPreview :machine="normalizedMachine" />
          </section>

          <section class="rounded-2xl border border-line bg-elevated p-3">
            <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <UIcon name="i-lucide-share-2" class="size-3.5 shrink-0" />
              分享 / 导入 payload
            </div>
            <UTextarea
              v-model="payloadText"
              :rows="5"
              aria-label="特殊抽题状态机 payload"
              placeholder="粘贴 payload 后点击「导入」"
              class="font-mono text-xs"
            />
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton color="neutral" variant="soft" size="sm" @click="exportPayload">
                生成并复制
              </UButton>
              <UButton color="neutral" variant="soft" size="sm" @click="importPayload">
                导入
              </UButton>
            </div>
          </section>
        </div>
      </aside>

      <main class="min-h-[520px] flex-1 overflow-hidden">
        <SpecialDrawGraph
          :machine="machine"
          :selected-node-id="selectedNodeId"
          @select-node="selectedNodeId = $event"
          @node-position="moveNode"
          @connect="connect"
          @delete-edge="deleteEdge"
        />
      </main>
    </div>
  </div>
</template>
