import { Alert, Button, Dropdown, Label, Spinner, TextArea } from '@heroui/react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import copyToClipboard from 'copy-to-clipboard'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import CircleStop from '~icons/lucide/circle-stop'
import Dices from '~icons/lucide/dices'
import Flag from '~icons/lucide/flag'
import FlagOff from '~icons/lucide/flag-off'
import GitBranch from '~icons/lucide/git-branch'
import Play from '~icons/lucide/play'
import Plus from '~icons/lucide/plus'
import Save from '~icons/lucide/save'
import Share2 from '~icons/lucide/share-2'
import ToggleLeft from '~icons/lucide/toggle-left'
import { SpecialDrawGraph } from '@/components/special-draw/SpecialDrawGraph'
import { SpecialDrawInspector } from '@/components/special-draw/SpecialDrawInspector'
import { listBanks, type QuestionBank } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { findSpecialDrawPlacement, type LayoutRect } from '@/lib/special-draw-layout'
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

function SpecialDrawEditorContent() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [banksLoading, setBanksLoading] = useState(true)
  const canvasRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, getNodes } = useReactFlow()
  const [machine, setMachine] = useState<SpecialDrawMachine>(
    () => loadSpecialDrawMachine() ?? createEmptySpecialDrawMachine(),
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => startNodeId(machine))
  const [payloadText, setPayloadText] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<SpecialDrawRunResult | null>(null)

  useEffect(() => {
    let cancelled = false
    listBanks()
      .then((res) => {
        if (!cancelled) setBanks(res.banks)
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载题目集失败'))
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SPECIAL_DRAW_STORAGE_KEY) {
        const next = loadSpecialDrawMachine() ?? createEmptySpecialDrawMachine()
        setMachine(next)
        setSelectedNodeId(startNodeId(next))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const bankMap = useMemo(() => new Map(banks.map((bank) => [bank.id, bank])), [banks])
  const bankMeta = useMemo(
    () => banks.map((bank) => ({ id: bank.id, name: bank.name, count: bank.questions.length })),
    [banks],
  )
  const normalizedMachine = useMemo<SpecialDrawMachine>(
    () => ({
      ...machine,
      nodes: machine.nodes.map((node) =>
        node.type === 'draw'
          ? { ...node, bankName: bankMap.get(node.bankId)?.name ?? node.bankName }
          : node,
      ),
    }),
    [bankMap, machine],
  )
  const validationError = useMemo(
    () => validateSpecialDrawMachine(normalizedMachine, bankMeta),
    [bankMeta, normalizedMachine],
  )
  const nodeIndex = useMemo(
    () => new Map(machine.nodes.map((node, index) => [node.id, index])),
    [machine.nodes],
  )
  const selectedNode = machine.nodes.find((node) => node.id === selectedNodeId) ?? null

  const updateNode = (id: string, updater: (node: SpecialDrawNode) => SpecialDrawNode) => {
    setMachine((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (node.id === id ? updater(node) : node)),
    }))
  }

  const addNode = (type: SpecialDrawNodeType) => {
    const bank = banks.find((item) => item.questions.length > 0)
    const rects: LayoutRect[] = getNodes().map((flowNode) => ({
      x: flowNode.position.x,
      y: flowNode.position.y,
      width: flowNode.measured?.width ?? 280,
      height: flowNode.measured?.height ?? 140,
    }))
    const innerCorner = findSpecialDrawPlacement(rects, { width: 360, height: 220 }, 60)
    const viewport = canvasRef.current?.getBoundingClientRect()
    const viewportCorner = viewport
      ? screenToFlowPosition({ x: viewport.right - 24, y: viewport.bottom - 24 })
      : null
    const maxX = machine.nodes.reduce((max, node) => Math.max(max, node.x), 0)
    const position =
      innerCorner ??
      (viewportCorner
        ? { x: Math.max(0, viewportCorner.x - 280), y: Math.max(0, viewportCorner.y - 150) }
        : { x: maxX + 340, y: 120 + (machine.nodes.length % 3) * 220 })

    const node = createSpecialDrawNode(
      type,
      bank ? { id: bank.id, name: bank.name, count: bank.questions.length } : undefined,
      position,
    )
    setMachine((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
    setSelectedNodeId(node.id)
  }

  const deleteNode = (id: string) => {
    const target = machine.nodes.find((node) => node.id === id)
    if (!target || target.type === 'start') {
      toast.error('开始节点不可删除')
      return
    }
    setMachine((prev) => {
      const nodes = prev.nodes.filter((node) => node.id !== id).map((node) => detachNode(node, id))
      return { ...prev, nodes }
    })
    setSelectedNodeId((current) => (current === id ? null : current))
    setTestResult(null)
  }

  const moveNode = (id: string, x: number, y: number) => {
    updateNode(id, (node) => ({ ...node, x: Math.max(0, x), y: Math.max(0, y) }))
  }

  const connect = (source: string, port: string, target: string) => {
    if (source === target) {
      toast.error('不能连接到自身')
      return
    }
    updateNode(source, (node) => setNodePortTarget(node, port, target))
    setTestResult(null)
  }

  const deleteEdge = (source: string, port: string) => {
    updateNode(source, (node) => setNodePortTarget(node, port, null))
    setTestResult(null)
  }

  const save = () => {
    if (validationError) {
      toast.error(validationError)
      return
    }
    try {
      saveSpecialDrawMachine(normalizedMachine)
      toast.success('已保存到当前设备')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    }
  }

  const test = async () => {
    if (validationError) {
      toast.error(validationError)
      return
    }
    setTesting(true)
    try {
      const specialBanks = await loadSpecialDrawBanks(normalizedMachine)
      const result = runSpecialDrawMachine(normalizedMachine, specialBanks)
      setTestResult(result)
      if (result.error) toast.error(result.error)
      else toast.success(`试运行完成，共抽取 ${result.questions.length} 题`)
    } catch (error) {
      toast.error(getErrorMessage(error, '试运行失败'))
    } finally {
      setTesting(false)
    }
  }

  const exportPayload = async () => {
    if (validationError) {
      toast.error(validationError)
      return
    }
    const payload = createSpecialDrawPayload(normalizedMachine)
    setPayloadText(payload)
    const ok = await copyToClipboard(payload)
    toast.success(ok ? 'payload 已复制' : 'payload 已生成，请手动复制')
  }

  const importPayload = () => {
    if (!payloadText.trim()) {
      toast.error('请先粘贴 payload')
      return
    }
    try {
      const next = parseSpecialDrawPayload(payloadText)
      const error = validateSpecialDrawMachine(next, bankMeta)
      if (error) throw new Error(error)
      setMachine(next)
      setSelectedNodeId(startNodeId(next))
      setTestResult(null)
      toast.success('payload 已导入')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败')
    }
  }

  const clear = () => {
    clearSpecialDrawMachine()
    const next = createEmptySpecialDrawMachine()
    setMachine(next)
    setSelectedNodeId(startNodeId(next))
    setTestResult(null)
    setPayloadText('')
    toast.success('已清除本地特殊抽题配置')
  }

  const activeFlags = testResult
    ? testResult.flags.flatMap((value, index) => (value ? [index] : []))
    : []

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl">
        <Link
          to="/console/checkoff"
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回验收
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0 flex-1 truncate text-sm font-bold">特殊的抽题方式</div>
        <span className="shrink-0 text-xs text-fg-subtle">
          {machine.nodes.length} 节点 · 16 flags
        </span>
        <Button variant="ghost" size="sm" onPress={clear}>
          清除
        </Button>
        <Button variant="secondary" size="sm" isPending={testing} onPress={() => void test()}>
          <Play width={14} height={14} className="shrink-0" />
          试运行
        </Button>
        <Button variant="primary" size="sm" onPress={save}>
          <Save width={14} height={14} className="shrink-0" />
          保存
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="max-h-[45vh] w-full shrink-0 overflow-y-auto border-b border-line bg-elevated/40 p-4 lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-4">
            {banksLoading && (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Spinner size="sm" />
                正在加载题目集…
              </div>
            )}

            {!banksLoading && banks.length === 0 && (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>还没有题目集，抽题节点无法配置。</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {validationError && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{validationError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <section className="flex flex-wrap items-center gap-2">
              <Dropdown>
                <Dropdown.Trigger className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line bg-elevated px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-sunken hover:text-fg">
                  <Plus width={14} height={14} className="shrink-0" />
                  添加节点
                </Dropdown.Trigger>
                <Dropdown.Popover className="min-w-[220px]">
                  <Dropdown.Menu onAction={(key) => addNode(String(key) as SpecialDrawNodeType)}>
                    <Dropdown.Item id="draw" textValue="抽题">
                      <Dices width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>抽题</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="ratio" textValue="抽取比例">
                      <GitBranch width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>抽取比例</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="count" textValue="数量条件">
                      <GitBranch width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>数量条件</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="flag" textValue="Flag 条件">
                      <Flag width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>Flag 条件</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="setFlag" textValue="设置 Flag">
                      <FlagOff width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>设置 Flag</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="toggleFlag" textValue="翻转 Flag">
                      <ToggleLeft width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>翻转 Flag</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="end" textValue="结束">
                      <CircleStop width={15} height={15} className="shrink-0 text-fg-muted" />
                      <Label>结束</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </section>

            <section className="rounded-2xl border border-line bg-elevated p-3">
              <div className="mb-2 text-xs font-bold text-fg">节点设置</div>
              {selectedNode ? (
                <SpecialDrawInspector
                  node={selectedNode}
                  nodes={machine.nodes}
                  nodeIndex={nodeIndex}
                  banks={banks}
                  bankMap={bankMap}
                  onUpdate={(updater) => updateNode(selectedNode.id, updater)}
                  onDelete={() => deleteNode(selectedNode.id)}
                />
              ) : (
                <p className="py-4 text-center text-xs text-fg-subtle">
                  点击画布上的节点开始编辑
                </p>
              )}
            </section>

            {testResult && (
              <section className="rounded-2xl border border-line bg-elevated p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-fg">试运行结果</span>
                  <span className="text-[11px] text-fg-muted">
                    {testResult.questions.length} 题 · 前一步 {testResult.lastDrawCount} 题
                  </span>
                </div>
                {activeFlags.length > 0 && (
                  <div className="mt-1 text-[11px] text-fg-muted">
                    Flags: {activeFlags.map((flag) => `#${flag}`).join(' ')}
                  </div>
                )}
                {testResult.error && (
                  <p className="mt-2 text-[11px] font-medium text-danger">{testResult.error}</p>
                )}
                {testResult.questions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {testResult.questions.map((question, index) => (
                      <div
                        key={question.id}
                        className="rounded-lg border border-line bg-sunken px-2 py-1.5"
                      >
                        <div className="text-[10px] font-semibold text-fg-muted">
                          第 {index + 1} 题
                        </div>
                        <div className="line-clamp-2 text-[11px] text-fg">{question.question}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  {testResult.trace.map((step, index) => (
                    <div key={`${step.nodeId}-${index}`} className="text-[10px] text-fg-subtle">
                      <span className="tabular mr-1 font-semibold text-fg-muted">{index + 1}.</span>
                      {step.detail}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-line bg-elevated p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg-muted">
                <Share2 width={14} height={14} className="shrink-0" />
                分享 / 导入 payload
              </div>
              <TextArea
                rows={5}
                value={payloadText}
                aria-label="特殊抽题状态机 payload"
                placeholder="粘贴 payload 后点击「导入」"
                className="font-mono text-xs"
                onChange={(event) => setPayloadText(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onPress={() => void exportPayload()}>
                  生成并复制
                </Button>
                <Button size="sm" variant="secondary" onPress={importPayload}>
                  导入
                </Button>
              </div>
            </section>
          </div>
        </aside>

        <main ref={canvasRef} className="min-h-[520px] flex-1 overflow-hidden">
          <SpecialDrawGraph
            machine={machine}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onNodePosition={moveNode}
            onConnect={connect}
            onDeleteEdge={deleteEdge}
          />
        </main>
      </div>
    </div>
  )
}

export default function SpecialDrawEditor() {
  return (
    <ReactFlowProvider>
      <SpecialDrawEditorContent />
    </ReactFlowProvider>
  )
}
