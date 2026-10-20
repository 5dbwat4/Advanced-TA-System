import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo } from 'react'

import { SpecialDrawFlowNodeCard } from '@/components/special-draw/SpecialDrawFlowNode'
import type { SpecialDrawMachine } from '@/lib/special-draw'
import {
  machineToFlowEdges,
  machineToFlowNodes,
  type SpecialDrawFlowNode,
} from '@/lib/special-draw-flow'

const nodeTypes = { specialDraw: SpecialDrawFlowNodeCard }

export function SpecialDrawGraph({
  machine,
  selectedNodeId,
  onSelectNode,
  onNodePosition,
  onConnect,
  onDeleteEdge,
}: {
  machine: SpecialDrawMachine
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onNodePosition: (id: string, x: number, y: number) => void
  onConnect: (source: string, port: string, target: string) => void
  onDeleteEdge: (source: string, port: string) => void
}) {
  const nodes = useMemo(
    () =>
      machineToFlowNodes(machine).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [machine, selectedNodeId],
  )

  const edges = useMemo(
    () =>
      machineToFlowEdges(machine).map((edge) => ({
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 2 },
      })),
    [machine],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange<SpecialDrawFlowNode>[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          onNodePosition(change.id, change.position.x, change.position.y)
        }
      }
    },
    [onNodePosition],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onNodeClick={(_event, node) => onSelectNode(node.id)}
      onPaneClick={() => onSelectNode(null)}
      onEdgeClick={(_event, edge) => {
        if (edge.sourceHandle) onDeleteEdge(edge.source, edge.sourceHandle)
      }}
      onConnect={(connection) => {
        if (!connection.source || !connection.target || !connection.sourceHandle) return
        onConnect(connection.source, connection.sourceHandle, connection.target)
      }}
      isValidConnection={(connection) =>
        Boolean(connection.source && connection.target && connection.source !== connection.target)
      }
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={null}
      className="bg-sunken"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <MiniMap pannable zoomable className="!bg-elevated" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
