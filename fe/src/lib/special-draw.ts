import { fetchBankQuestions, type CheckoffQuestion } from './api'

export const SPECIAL_DRAW_STORAGE_KEY = 'tasaas.checkoff.specialDraw.v2'
export const SPECIAL_DRAW_PAYLOAD_TYPE = 'tasaas.special-draw-machine'
export const SPECIAL_DRAW_VERSION = 2
export const SPECIAL_DRAW_FLAG_COUNT = 16
export const SPECIAL_DRAW_MAX_COUNT = 100
export const SPECIAL_DRAW_MAX_NODES = 128
export const SPECIAL_DRAW_MAX_STEPS = 128

export type SpecialDrawNodeType =
  | 'start'
  | 'draw'
  | 'ratio'
  | 'count'
  | 'flag'
  | 'setFlag'
  | 'toggleFlag'
  | 'end'

type NodeBase = { id: string; type: SpecialDrawNodeType; x: number; y: number }

export type StartNode = NodeBase & {
  type: 'start'
  next: string | null
}

export type DrawNode = NodeBase & {
  type: 'draw'
  bankId: string
  bankName: string
  min: number
  max: number
  next: string | null
}

export type RatioBranch = {
  id: string
  label: string
  weight: number
  next: string | null
}

export type RatioNode = NodeBase & {
  type: 'ratio'
  branches: RatioBranch[]
}

export type CountConditionNode = NodeBase & {
  type: 'count'
  op: 'gt' | 'eq' | 'lt'
  value: number
  trueNext: string | null
  falseNext: string | null
}

export type FlagConditionNode = NodeBase & {
  type: 'flag'
  flag: number
  value: boolean
  trueNext: string | null
  falseNext: string | null
}

export type SetFlagNode = NodeBase & {
  type: 'setFlag'
  flag: number
  value: boolean
  next: string | null
}

export type ToggleFlagNode = NodeBase & {
  type: 'toggleFlag'
  flag: number
  next: string | null
}

export type EndNode = NodeBase & { type: 'end' }

export type SpecialDrawNode =
  | StartNode
  | DrawNode
  | RatioNode
  | CountConditionNode
  | FlagConditionNode
  | SetFlagNode
  | ToggleFlagNode
  | EndNode

export type SpecialDrawMachine = {
  version: typeof SPECIAL_DRAW_VERSION
  nodes: SpecialDrawNode[]
}

export type SpecialDrawBank = {
  bankId: string
  bankName: string
  questions: CheckoffQuestion[]
}

export type SpecialDrawBankMeta = {
  id: string
  name: string
  count: number
}

export type SpecialDrawTrace = {
  nodeId: string
  type: SpecialDrawNodeType
  detail: string
}

export type SpecialDrawRunResult = {
  questions: CheckoffQuestion[]
  lastDrawCount: number
  flags: boolean[]
  trace: SpecialDrawTrace[]
  error: string | null
}

const NODE_TYPES = new Set<SpecialDrawNodeType>([
  'start',
  'draw',
  'ratio',
  'count',
  'flag',
  'setFlag',
  'toggleFlag',
  'end',
])

export function newSpecialDrawId(prefix = 'node'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptySpecialDrawMachine(): SpecialDrawMachine {
  const startId = newSpecialDrawId('start')
  const drawId = newSpecialDrawId('draw')
  const endId = newSpecialDrawId('end')
  return {
    version: SPECIAL_DRAW_VERSION,
    nodes: [
      { id: startId, type: 'start', x: 80, y: 100, next: drawId },
      {
        id: drawId,
        type: 'draw',
        x: 420,
        y: 100,
        bankId: '',
        bankName: '',
        min: 1,
        max: 1,
        next: endId,
      },
      { id: endId, type: 'end', x: 760, y: 100 },
    ],
  }
}

export function createSpecialDrawNode(
  type: SpecialDrawNodeType,
  bank?: { id: string; name: string; count: number },
  position: { x: number; y: number } = { x: 80, y: 100 },
): SpecialDrawNode {
  const id = newSpecialDrawId(type)
  const base = { id, x: position.x, y: position.y }
  switch (type) {
    case 'start':
      return { ...base, type, next: null }
    case 'draw':
      return {
        ...base,
        type,
        bankId: bank?.id ?? '',
        bankName: bank?.name ?? '',
        min: 1,
        max: bank ? Math.min(3, Math.max(1, bank.count)) : 1,
        next: null,
      }
    case 'ratio':
      return {
        ...base,
        type,
        branches: [
          { id: newSpecialDrawId('branch'), label: '分支 1', weight: 50, next: null },
          { id: newSpecialDrawId('branch'), label: '分支 2', weight: 50, next: null },
        ],
      }
    case 'count':
      return { ...base, type, op: 'gt', value: 0, trueNext: null, falseNext: null }
    case 'flag':
      return { ...base, type, flag: 0, value: true, trueNext: null, falseNext: null }
    case 'setFlag':
      return { ...base, type, flag: 0, value: true, next: null }
    case 'toggleFlag':
      return { ...base, type, flag: 0, next: null }
    case 'end':
      return { ...base, type }
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function readNodeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNext(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('节点连接格式不正确')
  return value.trim() ? value : null
}

function readFlagIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= SPECIAL_DRAW_FLAG_COUNT) {
    throw new Error(`flag 编号必须是 0 到 ${SPECIAL_DRAW_FLAG_COUNT - 1}`)
  }
  return value
}

function readPositiveInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label}必须是正整数`)
  }
  return value
}

function readInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label}必须是整数`)
  }
  return value
}

function parseNode(value: unknown): SpecialDrawNode {
  const node = asRecord(value)
  if (!node) throw new Error('节点格式不正确')
  const id = readNodeId(node.id)
  if (!id) throw new Error('节点缺少 id')
  if (typeof node.x !== 'number' || !Number.isFinite(node.x)) throw new Error(`节点缺少横坐标`)
  if (typeof node.y !== 'number' || !Number.isFinite(node.y)) throw new Error(`节点缺少纵坐标`)
  const base = { id, x: node.x, y: node.y }
  if (typeof node.type !== 'string' || !NODE_TYPES.has(node.type as SpecialDrawNodeType)) {
    throw new Error(`节点的类型不正确`)
  }

  switch (node.type as SpecialDrawNodeType) {
    case 'start':
      return { ...base, type: 'start', next: readNext(node.next) }
    case 'draw':
      return {
        ...base,
        type: 'draw',
        bankId: typeof node.bankId === 'string' ? node.bankId : '',
        bankName: typeof node.bankName === 'string' ? node.bankName : '',
        min: readPositiveInt(node.min, '最小抽取题数'),
        max: readPositiveInt(node.max, '最大抽取题数'),
        next: readNext(node.next),
      }
    case 'ratio': {
      if (!Array.isArray(node.branches) || node.branches.length === 0) {
        throw new Error(`节点没有分支`)
      }
      const branches = node.branches.map((item): RatioBranch => {
        const branch = asRecord(item)
        if (!branch) throw new Error(`节点的分支格式不正确`)
        const branchId = readNodeId(branch.id)
        if (!branchId) throw new Error(`节点的分支缺少 id`)
        const weight = branch.weight
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
          throw new Error(`节点的分支权重不正确`)
        }
        return {
          id: branchId,
          label: typeof branch.label === 'string' ? branch.label : branchId,
          weight,
          next: readNext(branch.next),
        }
      })
      return { ...base, type: 'ratio', branches }
    }
    case 'count': {
      if (node.op !== 'gt' && node.op !== 'eq' && node.op !== 'lt') {
        throw new Error(`节点的比较方式不正确`)
      }
      return {
        ...base,
        type: 'count',
        op: node.op,
        value: readInt(node.value, '比较值'),
        trueNext: readNext(node.trueNext),
        falseNext: readNext(node.falseNext),
      }
    }
    case 'flag':
      return {
        ...base,
        type: 'flag',
        flag: readFlagIndex(node.flag),
        value: node.value === true,
        trueNext: readNext(node.trueNext),
        falseNext: readNext(node.falseNext),
      }
    case 'setFlag':
      return {
        ...base,
        type: 'setFlag',
        flag: readFlagIndex(node.flag),
        value: node.value === true,
        next: readNext(node.next),
      }
    case 'toggleFlag':
      return { ...base, type: 'toggleFlag', flag: readFlagIndex(node.flag), next: readNext(node.next) }
    case 'end':
      return { ...base, type: 'end' }
  }
}

function readMachine(value: unknown): SpecialDrawMachine {
  const payload = asRecord(value)
  if (!payload) throw new Error('payload 格式不正确')
  if (payload.type !== SPECIAL_DRAW_PAYLOAD_TYPE) throw new Error('不是特殊抽题状态机 payload')
  if (payload.version !== SPECIAL_DRAW_VERSION) throw new Error('payload 版本不受支持')
  if (!Array.isArray(payload.nodes) || payload.nodes.length === 0) {
    throw new Error('状态机没有节点')
  }
  if (payload.nodes.length > SPECIAL_DRAW_MAX_NODES) {
    throw new Error(`最多支持 ${SPECIAL_DRAW_MAX_NODES} 个节点`)
  }

  const nodes = payload.nodes.map(parseNode)
  const ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error('状态机中有重复节点')
    ids.add(node.id)
  }
  if (nodes.filter((node) => node.type === 'start').length !== 1) {
    throw new Error('状态机必须且只能有一个开始节点')
  }

  const assertNext = (next: string | null) => {
    if (next && !ids.has(next)) throw new Error('节点连接指向不存在的节点')
  }
  for (const node of nodes) {
    if (
      node.type === 'start' ||
      node.type === 'draw' ||
      node.type === 'setFlag' ||
      node.type === 'toggleFlag'
    ) {
      assertNext(node.next)
    } else if (node.type === 'ratio') {
      for (const branch of node.branches) assertNext(branch.next)
    } else if (node.type === 'count' || node.type === 'flag') {
      assertNext(node.trueNext)
      assertNext(node.falseNext)
    }
  }

  if (!nodes.some((node) => node.type === 'draw')) throw new Error('状态机至少需要一个抽题节点')

  return { version: SPECIAL_DRAW_VERSION, nodes }
}

export function createSpecialDrawPayload(machine: SpecialDrawMachine): string {
  return JSON.stringify(
    {
      type: SPECIAL_DRAW_PAYLOAD_TYPE,
      version: SPECIAL_DRAW_VERSION,
      nodes: machine.nodes,
    },
    null,
    2,
  )
}

export function parseSpecialDrawPayload(raw: string): SpecialDrawMachine {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('payload 不是合法 JSON')
  }
  return readMachine(value)
}

export function loadSpecialDrawMachine(): SpecialDrawMachine | null {
  try {
    const raw = localStorage.getItem(SPECIAL_DRAW_STORAGE_KEY)
    return raw ? parseSpecialDrawPayload(raw) : null
  } catch {
    return null
  }
}

export function saveSpecialDrawMachine(machine: SpecialDrawMachine): void {
  localStorage.setItem(SPECIAL_DRAW_STORAGE_KEY, createSpecialDrawPayload(machine))
}

export function clearSpecialDrawMachine(): void {
  try {
    localStorage.removeItem(SPECIAL_DRAW_STORAGE_KEY)
  } catch {
    // localStorage 不可用时忽略
  }
}

export function validateSpecialDrawMachine(
  machine: SpecialDrawMachine,
  banks: SpecialDrawBankMeta[],
): string | null {
  if (machine.nodes.length === 0) return '状态机没有节点'
  if (machine.nodes.length > SPECIAL_DRAW_MAX_NODES) {
    return `最多支持 ${SPECIAL_DRAW_MAX_NODES} 个节点`
  }
  const bankMap = new Map(banks.map((bank) => [bank.id, bank]))
  const ids = new Set<string>()
  for (const node of machine.nodes) {
    if (ids.has(node.id)) return '存在重复的节点'
    ids.add(node.id)
  }
  if (machine.nodes.filter((node) => node.type === 'start').length !== 1) {
    return '必须且只能有一个开始节点'
  }
  if (!machine.nodes.some((node) => node.type === 'draw')) return '至少需要一个抽题节点'

  const checkNext = (next: string | null): string | null =>
    next && !ids.has(next) ? '节点连接指向不存在的节点' : null

  for (const node of machine.nodes) {
    if (node.type === 'start') {
      const nextError = checkNext(node.next)
      if (nextError) return nextError
    } else if (node.type === 'draw') {
      const bank = bankMap.get(node.bankId)
      if (!bank) return `抽题节点引用了不存在的题目集：${node.bankName || node.bankId || '未选择'}`
      if (node.min < 1 || node.max < node.min) return '抽题节点的题数范围不正确'
      if (bank.count === 0) return `题目集「${bank.name}」中没有题目`
      if (node.min > bank.count) return `题目集「${bank.name}」只有 ${bank.count} 题`
      if (node.max > bank.count) return `题目集「${bank.name}」只有 ${bank.count} 题`
      const nextError = checkNext(node.next)
      if (nextError) return nextError
    } else if (node.type === 'ratio') {
      if (node.branches.length === 0) return '比例节点至少需要一个分支'
      if (node.branches.every((branch) => branch.weight <= 0)) return '比例节点至少需要一个权重大于 0 的分支'
      for (const branch of node.branches) {
        if (branch.weight < 0) return '比例节点的权重不能为负数'
        const nextError = checkNext(branch.next)
        if (nextError) return nextError
      }
    } else if (node.type === 'count') {
      if (node.value < 0) return '数量条件的比较值不能为负数'
      const trueError = checkNext(node.trueNext)
      if (trueError) return trueError
      const falseError = checkNext(node.falseNext)
      if (falseError) return falseError
    } else if (node.type === 'flag') {
      const trueError = checkNext(node.trueNext)
      if (trueError) return trueError
      const falseError = checkNext(node.falseNext)
      if (falseError) return falseError
    } else if (node.type === 'setFlag' || node.type === 'toggleFlag') {
      const nextError = checkNext(node.next)
      if (nextError) return nextError
    }
  }

  return null
}

export async function loadSpecialDrawBanks(machine: SpecialDrawMachine): Promise<SpecialDrawBank[]> {
  const names = new Map<string, string>()
  for (const node of machine.nodes) {
    if (node.type === 'draw' && node.bankId && !names.has(node.bankId)) {
      names.set(node.bankId, node.bankName)
    }
  }

  return Promise.all(
    [...names.entries()].map(async ([bankId, bankName]) => {
      const res = await fetchBankQuestions(bankId)
      return {
        bankId,
        bankName,
        questions: res.questions.map((question) => ({
          id: question.id,
          question: question.question,
          answer: question.answer,
          user: question.user,
        })),
      }
    }),
  )
}

function pickWeightedBranch(branches: RatioBranch[]): RatioBranch | null {
  const eligible = branches.filter((branch) => branch.weight > 0)
  if (eligible.length === 0) return null
  const total = eligible.reduce((sum, branch) => sum + branch.weight, 0)
  let ticket = Math.random() * total
  for (const branch of eligible) {
    if (ticket < branch.weight) return branch
    ticket -= branch.weight
  }
  return eligible[eligible.length - 1]
}

export function runSpecialDrawMachine(
  machine: SpecialDrawMachine,
  banks: SpecialDrawBank[],
): SpecialDrawRunResult {
  const byId = new Map(machine.nodes.map((node) => [node.id, node]))
  const bankMap = new Map(banks.map((bank) => [bank.bankId, bank]))
  const flags = Array.from({ length: SPECIAL_DRAW_FLAG_COUNT }, () => false)
  const used = new Set<string>()
  const questions: CheckoffQuestion[] = []
  const trace: SpecialDrawTrace[] = []
  let lastDrawCount = 0
  const startNode = machine.nodes.find((node) => node.type === 'start')
  if (!startNode) {
    return { questions, lastDrawCount, flags, trace, error: '状态机缺少开始节点' }
  }

  let current: string | null = startNode.id
  let steps = 0

  while (current && steps < SPECIAL_DRAW_MAX_STEPS) {
    const node = byId.get(current)
    steps += 1
    if (!node) {
      return { questions, lastDrawCount, flags, trace, error: '状态机中的节点不存在' }
    }

    if (node.type === 'start') {
      trace.push({ nodeId: node.id, type: node.type, detail: '开始' })
      current = node.next
    } else if (node.type === 'draw') {
      const bank = bankMap.get(node.bankId)
      if (!bank) {
        trace.push({ nodeId: node.id, type: node.type, detail: '题目集不存在' })
        return {
          questions,
          lastDrawCount,
          flags,
          trace,
          error: `题目集不存在：${node.bankName || node.bankId}`,
        }
      }
      if (node.min < 1 || node.max < node.min) {
        return { questions, lastDrawCount, flags, trace, error: '抽题节点的题数范围不正确' }
      }
      const target = node.min + Math.floor(Math.random() * (node.max - node.min + 1))
      const picked = shuffle(bank.questions.filter((question) => !used.has(question.id))).slice(
        0,
        target,
      )
      for (const question of picked) {
        used.add(question.id)
        questions.push(question)
      }
      lastDrawCount = picked.length
      trace.push({
        nodeId: node.id,
        type: node.type,
        detail: `从「${bank.bankName}」抽取 ${picked.length} 题（目标 ${target} 题）`,
      })
      current = node.next
    } else if (node.type === 'ratio') {
      const branch = pickWeightedBranch(node.branches)
      if (!branch) {
        return { questions, lastDrawCount, flags, trace, error: '比例节点没有有效分支' }
      }
      trace.push({
        nodeId: node.id,
        type: node.type,
        detail: `选择分支「${branch.label}」`,
      })
      current = branch.next
    } else if (node.type === 'count') {
      const pass =
        node.op === 'gt'
          ? lastDrawCount > node.value
          : node.op === 'eq'
            ? lastDrawCount === node.value
            : lastDrawCount < node.value
      trace.push({
        nodeId: node.id,
        type: node.type,
        detail: `前一步抽取 ${lastDrawCount} 题，条件${pass ? '成立' : '不成立'}`,
      })
      current = pass ? node.trueNext : node.falseNext
    } else if (node.type === 'flag') {
      const pass = flags[node.flag] === node.value
      trace.push({
        nodeId: node.id,
        type: node.type,
        detail: `flag ${node.flag} 为 ${flags[node.flag]}，条件${pass ? '成立' : '不成立'}`,
      })
      current = pass ? node.trueNext : node.falseNext
    } else if (node.type === 'setFlag') {
      flags[node.flag] = node.value
      trace.push({
        nodeId: node.id,
        type: node.type,
        detail: `将 flag ${node.flag} 设为 ${node.value}`,
      })
      current = node.next
    } else if (node.type === 'toggleFlag') {
      flags[node.flag] = !flags[node.flag]
      trace.push({
        nodeId: node.id,
        type: node.type,
        detail: `翻转 flag ${node.flag} 为 ${flags[node.flag]}`,
      })
      current = node.next
    } else {
      trace.push({ nodeId: node.id, type: node.type, detail: '结束' })
      current = null
    }
  }

  if (current) {
    return {
      questions,
      lastDrawCount,
      flags,
      trace,
      error: `执行步数超过 ${SPECIAL_DRAW_MAX_STEPS}，可能存在环`,
    }
  }

  return { questions, lastDrawCount, flags, trace, error: null }
}
