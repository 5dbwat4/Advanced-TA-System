<script setup lang="ts">
import { computed, onUnmounted, useId } from 'vue'
import { MarkerType, VueFlow, useVueFlow } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'

import SpecialDrawFlowNode from '@/components/special-draw/SpecialDrawFlowNode.vue'
import type { SpecialDrawMachine } from '@/lib/special-draw'
import { machineToFlowEdges, machineToFlowNodes } from '@/lib/special-draw-flow'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = defineProps<{
  machine: SpecialDrawMachine
}>()

const flowId = `special-draw-preview-${useId()}`
const { fitView, onNodesInitialized } = useVueFlow({ id: flowId })

const nodes = computed(() => machineToFlowNodes(props.machine))

const edges = computed(() =>
  machineToFlowEdges(props.machine).map((edge) => ({
    ...edge,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { strokeWidth: 1.5 },
  })),
)

const graphKey = computed(() =>
  props.machine.nodes.map((node) => `${node.id}:${node.x}:${node.y}`).join('|'),
)

const summary = computed(() => {
  const names = [
    ...new Set(
      props.machine.nodes.flatMap((node) =>
        node.type === 'draw' && node.bankName ? [node.bankName] : [],
      ),
    ),
  ]
  return names.length > 0 ? names.join('、') : '未引用题目集'
})

let frame = 0

onNodesInitialized(() => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    void fitView({ padding: 0.18 })
  })
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-line bg-sunken">
    <div class="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs">
      <span class="truncate font-semibold text-fg">{{ summary }}</span>
      <span class="shrink-0 text-fg-subtle">{{ machine.nodes.length }} 个节点</span>
    </div>
    <div class="h-80">
      <VueFlow
        :id="flowId"
        :key="graphKey"
        :nodes="nodes"
        :edges="edges"
        :min-zoom="0.15"
        :max-zoom="1.6"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="false"
        :zoom-on-scroll="false"
        :pan-on-scroll="false"
        :prevent-scrolling="false"
        class="bg-sunken"
      >
        <template #node-specialDraw="nodeProps">
          <SpecialDrawFlowNode v-bind="nodeProps" />
        </template>
        <Background :variant="BackgroundVariant.Dots" :gap="20" :size="1" />
      </VueFlow>
    </div>
  </div>
</template>
