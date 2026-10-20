import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'

import { SpecialDrawFlowNodeCard } from '@/components/special-draw/SpecialDrawFlowNode'
import { specialDrawMachineSummary } from '@/components/special-draw/special-draw-ui'
import type { SpecialDrawMachine } from '@/lib/special-draw'
import {
  machineToFlowEdges,
  machineToFlowNodes,
  type SpecialDrawFlowNode,
} from '@/lib/special-draw-flow'

const nodeTypes = { specialDraw: SpecialDrawFlowNodeCard }

function PreviewAutoFit({ machine }: { machine: SpecialDrawMachine }) {
  const { fitView } = useReactFlow()
  const nodesInitialized = useNodesInitialized()

  useEffect(() => {
    if (!nodesInitialized) return
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.18 })
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, machine, nodesInitialized])

  return null
}

export function SpecialDrawPreview({ machine }: { machine: SpecialDrawMachine }) {
  const nodes = useMemo<SpecialDrawFlowNode[]>(() => machineToFlowNodes(machine), [machine])
  const edges = useMemo<Edge[]>(
    () =>
      machineToFlowEdges(machine).map((edge) => ({
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { strokeWidth: 1.5 },
      })),
    [machine],
  )
  const graphKey = machine.nodes
    .map((node) => `${node.id}:${node.x}:${node.y}`)
    .join('|')

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-sunken">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs">
        <span className="truncate font-semibold text-fg">
          {specialDrawMachineSummary(machine)}
        </span>
        <span className="shrink-0 text-fg-subtle">{machine.nodes.length} 个节点</span>
      </div>
      <div className="h-80">
        <ReactFlowProvider key={graphKey}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.15}
            maxZoom={1.6}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            panOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            className="bg-sunken"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <PreviewAutoFit machine={machine} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  )
}
