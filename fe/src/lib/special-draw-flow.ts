import type { Edge, Node } from '@xyflow/react'

import type { SpecialDrawMachine, SpecialDrawNode } from '@/lib/special-draw'

export type SpecialDrawFlowData = {
  node: SpecialDrawNode
  index: number
}

export type SpecialDrawFlowNode = Node<SpecialDrawFlowData, 'specialDraw'>

export type OutputPort = {
  key: string
  label: string
}

export function outputPorts(node: SpecialDrawNode): OutputPort[] {
  if (node.type === 'start') {
    return [{ key: 'next', label: '下一步' }]
  }
  if (node.type === 'draw' || node.type === 'setFlag' || node.type === 'toggleFlag') {
    return [{ key: 'next', label: '下一步' }]
  }
  if (node.type === 'ratio') {
    return node.branches.map((branch) => ({ key: `branch:${branch.id}`, label: branch.label }))
  }
  if (node.type === 'count' || node.type === 'flag') {
    return [
      { key: 'true', label: '成立' },
      { key: 'false', label: '不成立' },
    ]
  }
  return []
}

export function nodeNext(node: SpecialDrawNode, port: string): string | null {
  if (node.type === 'start') {
    return port === 'next' ? node.next : null
  }
  if (node.type === 'draw' || node.type === 'setFlag' || node.type === 'toggleFlag') {
    return port === 'next' ? node.next : null
  }
  if (node.type === 'ratio') {
    const branchId = port.startsWith('branch:') ? port.slice(7) : ''
    return node.branches.find((branch) => branch.id === branchId)?.next ?? null
  }
  if (node.type === 'count' || node.type === 'flag') {
    if (port === 'true') return node.trueNext
    if (port === 'false') return node.falseNext
  }
  return null
}

export function setNodePortTarget(
  node: SpecialDrawNode,
  port: string,
  target: string | null,
): SpecialDrawNode {
  if (node.type === 'start') {
    return port === 'next' ? { ...node, next: target } : node
  }
  if (node.type === 'draw' || node.type === 'setFlag' || node.type === 'toggleFlag') {
    return port === 'next' ? { ...node, next: target } : node
  }
  if (node.type === 'ratio') {
    if (!port.startsWith('branch:')) return node
    const branchId = port.slice(7)
    return {
      ...node,
      branches: node.branches.map((branch) =>
        branch.id === branchId ? { ...branch, next: target } : branch,
      ),
    }
  }
  if (node.type === 'count' || node.type === 'flag') {
    if (port === 'true') return { ...node, trueNext: target }
    if (port === 'false') return { ...node, falseNext: target }
  }
  return node
}

export function machineToFlowNodes(machine: SpecialDrawMachine): SpecialDrawFlowNode[] {
  return machine.nodes.map((node, index) => ({
    id: node.id,
    type: 'specialDraw',
    position: { x: node.x, y: node.y },
    data: { node, index },
  }))
}

export function machineToFlowEdges(machine: SpecialDrawMachine): Edge[] {
  const ids = new Set(machine.nodes.map((node) => node.id))
  const edges: Edge[] = []

  for (const node of machine.nodes) {
    for (const port of outputPorts(node)) {
      const target = nodeNext(node, port.key)
      if (!target || !ids.has(target)) continue
      edges.push({
        id: `${node.id}::${port.key}`,
        source: node.id,
        sourceHandle: port.key,
        target,
        targetHandle: 'in',
        type: 'smoothstep',
      })
    }
  }

  return edges
}
