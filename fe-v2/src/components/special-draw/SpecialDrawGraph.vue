<script setup lang="ts">
import { computed, useId } from 'vue'
import {
  MarkerType,
  VueFlow,
  useVueFlow,
  type Connection,
  type EdgeMouseEvent,
  type NodeChange,
  type NodeMouseEvent,
} from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

import SpecialDrawFlowNode from '@/components/special-draw/SpecialDrawFlowNode.vue'
import type { SpecialDrawMachine } from '@/lib/special-draw'
import {
  machineToFlowEdges,
  machineToFlowNodes,
  type SpecialDrawFlowNode as SpecialDrawFlowNodeType,
} from '@/lib/special-draw-flow'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

const props = defineProps<{
  machine: SpecialDrawMachine
  selectedNodeId: string | null
}>()

const emit = defineEmits<{
  'select-node': [id: string | null]
  'node-position': [id: string, x: number, y: number]
  connect: [source: string, port: string, target: string]
  'delete-edge': [source: string, port: string]
}>()

const flowId = `special-draw-graph-${useId()}`
const { fitView, onNodesInitialized } = useVueFlow({ id: flowId })

const nodes = computed<SpecialDrawFlowNodeType[]>(() =>
  machineToFlowNodes(props.machine).map((node) => ({
    ...node,
    selected: node.id === props.selectedNodeId,
  })),
)

const edges = computed(() =>
  machineToFlowEdges(props.machine).map((edge) => ({
    ...edge,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { strokeWidth: 2 },
  })),
)

let fitted = false

onNodesInitialized(() => {
  if (fitted) return
  fitted = true
  requestAnimationFrame(() => {
    void fitView({ padding: 0.25 })
  })
})

function handleNodesChange(changes: NodeChange[]) {
  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      emit('node-position', change.id, change.position.x, change.position.y)
    }
  }
}

function handleNodeClick({ node }: NodeMouseEvent) {
  emit('select-node', node.id)
}

function handlePaneClick() {
  emit('select-node', null)
}

function handleEdgeClick({ edge }: EdgeMouseEvent) {
  if (edge.sourceHandle) {
    emit('delete-edge', edge.source, edge.sourceHandle)
  }
}

function handleConnect(connection: Connection) {
  if (!connection.source || !connection.target || !connection.sourceHandle) return
  emit('connect', connection.source, connection.sourceHandle, connection.target)
}

function isValidConnection(connection: Connection) {
  return Boolean(connection.source && connection.target && connection.source !== connection.target)
}
</script>

<template>
  <VueFlow
    :id="flowId"
    :nodes="nodes"
    :edges="edges"
    :is-valid-connection="isValidConnection"
    :min-zoom="0.2"
    :max-zoom="1.6"
    :delete-key-code="null"
    class="bg-sunken"
    @nodes-change="handleNodesChange"
    @node-click="handleNodeClick"
    @pane-click="handlePaneClick"
    @edge-click="handleEdgeClick"
    @connect="handleConnect"
  >
    <template #node-specialDraw="nodeProps">
      <SpecialDrawFlowNode v-bind="nodeProps" />
    </template>
    <Background :variant="BackgroundVariant.Dots" :gap="20" :size="1" />
    <MiniMap pannable zoomable class="!bg-elevated" />
    <Controls :show-interactive="false" />
  </VueFlow>
</template>
