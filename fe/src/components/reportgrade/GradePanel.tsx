import {
  Alert,
  Button,
  Dropdown,
  Input,
  Label,
  Modal,
  TextArea,
  useOverlayState,
} from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ClipboardList from '~icons/lucide/clipboard-list'
import Copy from '~icons/lucide/copy'
import Ellipsis from '~icons/lucide/ellipsis'
import FileDown from '~icons/lucide/file-down'
import Plus from '~icons/lucide/plus'
import Save from '~icons/lucide/save'
import TriangleAlert from '~icons/lucide/triangle-alert'
import { CriteriaGrading } from '@/components/criteria/CriteriaGrading'
import { CriteriaPreview } from '@/components/criteria/CriteriaPreview'
import { defaultStates, decodeReviewContent, encodeReviewContent, totalScore } from '@/components/criteria/scoring'
import type {
  CriterionCard,
  CriterionCardState,
  CriterionItem,
  CriterionMode,
} from '@/components/criteria/types'
import { RemarkField } from '@/components/remarks/RemarkField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { PendingButton } from '@/components/ui/PendingButton'
import { fetchCriteria, fetchReportReview, saveReportReview, saveScore, type Score } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatScore, type GradeStudent } from './shared'

const EMPTY_CARD_STATE: CriterionCardState = { selected: false, score: '', appendix: '' }

export function GradePanel({
  student,
  experimentId,
  onScoreSaved,
}: {
  student: GradeStudent | null
  experimentId: string
  onScoreSaved?: (score: Score) => void
}) {
  const navigate = useNavigate()
  const criteriaState = useOverlayState()
  const addState = useOverlayState()
  const rangeState = useOverlayState()

  const [shareCode, setShareCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadedCriteria, setLoadedCriteria] = useState<CriterionItem[] | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const [items, setItems] = useState<CriterionItem[] | null>(null)
  const [ruleKey, setRuleKey] = useState<string | null>(null)
  const [states, setStates] = useState<Record<string, CriterionCardState>>({})
  const [extras, setExtras] = useState<Record<string, CriterionCard[]>>({})
  const [dirty, setDirty] = useState(false)
  const [savedOverride, setSavedOverride] = useState<{ stuId: string; score: Score } | null>(null)
  const [savingReport, setSavingReport] = useState(false)

  const [addTarget, setAddTarget] = useState('root')
  const [newMode, setNewMode] = useState<CriterionMode>('subtract')
  const [newScore, setNewScore] = useState('')
  const [newRule, setNewRule] = useState('')
  const [newDetail, setNewDetail] = useState('')

  const itemsRef = useRef<CriterionItem[] | null>(null)
  const ruleKeyRef = useRef<string | null>(null)

  const stuId = student?.stuId ?? null
  const total = items ? totalScore(items, states, extras) : 0
  const hasCriteria = items != null
  const savedScore =
    savedOverride && savedOverride.stuId === stuId ? savedOverride.score : (student?.score ?? null)
  const displayScore = hasCriteria ? total : (savedScore?.score ?? null)
  const showSavedMeta = savedScore != null && (!hasCriteria || savedScore.score === total)
  const canSaveReport = hasCriteria && stuId != null && ruleKey != null

  useEffect(() => {
    if (!stuId) return
    let cancelled = false
    setDirty(false)
    fetchReportReview(stuId, experimentId)
      .then(async (review) => {
        if (cancelled) return
        if (!review) {
          const current = itemsRef.current
          if (current) {
            setStates(defaultStates(current))
            setExtras({})
          }
          return
        }
        const content = decodeReviewContent(review.ruleContent)
        setRuleKey(review.ruleId)
        setStates(content.cards)
        setExtras(content.extras)
        if (review.ruleId === ruleKeyRef.current) return
        const res = await fetchCriteria(review.ruleId)
        if (cancelled) return
        const payload = res.payload as { items?: CriterionItem[] } | null
        if (payload?.items) {
          setItems(payload.items)
          itemsRef.current = payload.items
          ruleKeyRef.current = review.ruleId
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [stuId, experimentId])

  useEffect(() => {
    if (!dirty || !items || !ruleKey || !stuId) return
    const timer = window.setTimeout(() => {
      const content = encodeReviewContent(states, extras, items)
      saveReportReview({ stuId, experimentId, ruleId: ruleKey, ruleContent: content }).catch(() => {
        toast.error('批阅记录保存失败')
      })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [dirty, items, ruleKey, stuId, experimentId, states, extras])

  const loadCriteria = async () => {
    const code = shareCode.trim().toLowerCase()
    if (!/^[0-9a-f]{48}$/.test(code)) {
      toast.error('分享码格式不正确')
      return
    }
    setLoading(true)
    try {
      const res = await fetchCriteria(code)
      const payload = res.payload as { items?: CriterionItem[] } | null
      if (!payload || !Array.isArray(payload.items)) {
        setLoadedCriteria(null)
        setLoadedKey(null)
        toast.error('评分标准内容无效')
        return
      }
      setLoadedCriteria(payload.items)
      setLoadedKey(code)
    } catch (err) {
      setLoadedCriteria(null)
      setLoadedKey(null)
      toast.error(getErrorMessage(err, '加载失败'))
    } finally {
      setLoading(false)
    }
  }

  const confirmCriteria = () => {
    if (!loadedCriteria || !loadedKey) return
    setItems(loadedCriteria)
    itemsRef.current = loadedCriteria
    setRuleKey(loadedKey)
    ruleKeyRef.current = loadedKey
    setStates(defaultStates(loadedCriteria))
    setExtras({})
    setDirty(false)
    criteriaState.close()
    toast.success('已应用评分标准')
  }

  const copyShareCode = async () => {
    if (!ruleKey) {
      toast.error('尚未设置评分标准')
      return
    }
    if (await copyToClipboard(ruleKey)) toast.success('分享码已复制')
    else toast.error('复制失败，请手动复制')
  }

  const toggleCard = (cardId: string) => {
    setDirty(true)
    setStates((prev) => {
      const current = prev[cardId] ?? EMPTY_CARD_STATE
      return { ...prev, [cardId]: { ...current, selected: !current.selected } }
    })
  }

  const setCardScore = (cardId: string, score: string) => {
    setDirty(true)
    setStates((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? EMPTY_CARD_STATE), score },
    }))
  }

  const setCardAppendix = (cardId: string, appendix: string) => {
    setDirty(true)
    setStates((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? EMPTY_CARD_STATE), appendix },
    }))
  }

  const openAdd = (sectionId: string | null) => {
    setAddTarget(sectionId ?? 'root')
    setNewMode('subtract')
    setNewScore('')
    setNewRule('')
    setNewDetail('')
    addState.open()
  }

  const submitAdd = () => {
    const score = Number(newScore)
    if (newScore.trim() === '' || !Number.isFinite(score)) {
      toast.error('请输入分值')
      return
    }
    const card: CriterionCard = {
      id: crypto.randomUUID(),
      type: 'card',
      mode: newMode,
      rule: newRule.trim(),
      detail: newDetail.trim(),
      score: String(score),
      scoreMax: '',
      defaultSelected: true,
    }
    const target = addTarget
    setExtras((prev) => ({ ...prev, [target]: [...(prev[target] ?? []), card] }))
    setStates((prev) => ({ ...prev, [card.id]: { ...EMPTY_CARD_STATE, selected: true } }))
    setDirty(true)
    addState.close()
  }

  const saveReportScore = async () => {
    if (!stuId || !ruleKey || !items) return
    setSavingReport(true)
    try {
      const content = encodeReviewContent(states, extras, items)
      await saveReportReview({ stuId, experimentId, ruleId: ruleKey, ruleContent: content })
      setDirty(false)
      const res = await saveScore({ stuId, type: 2, indId: experimentId, score: total })
      setSavedOverride({ stuId, score: res.score })
      onScoreSaved?.(res.score)
      toast.success('已保存报告分')
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'))
    } finally {
      setSavingReport(false)
    }
  }

  const requestSaveReport = () => {
    if (!canSaveReport) return
    if (total > 100 || total < 0) {
      rangeState.open()
      return
    }
    void saveReportScore()
  }

  const confirmOutOfRange = () => {
    void saveReportScore().finally(() => rangeState.close())
  }

  if (!student) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-xs text-fg-subtle">请选择学生开始批改</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-10 shrink-0 border-b border-line bg-bg p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 rounded-xl border border-line bg-sunken px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-fg-subtle">当前报告分</span>
              {displayScore != null ? (
                <span className="tabular text-xl font-bold text-brand-600 dark:text-brand-300">
                  {formatScore(displayScore)}
                </span>
              ) : (
                <span className="text-sm text-fg-subtle">未批改</span>
              )}
            </div>
          </div>
          <PendingButton
            size="sm"
            variant="secondary"
            isPending={savingReport}
            isDisabled={!canSaveReport}
            onPress={requestSaveReport}
            icon={Save}
          >
            保存
          </PendingButton>
        </div>
        {displayScore != null && (
          <div className="mt-2 text-[11px] text-fg-subtle">
            {showSavedMeta && savedScore
              ? `${savedScore.graderName ?? '—'} · ${formatLocaleDateTime(savedScore.updatedAt)}`
              : '未保存'}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <span className="text-xs font-semibold text-fg-muted">评分标准</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="flex-1" onPress={criteriaState.open}>
            <ClipboardList width={15} height={15} className="shrink-0" />
            设置评分标准
          </Button>
          <Dropdown>
            <Button isIconOnly variant="secondary" aria-label="更多操作">
              <Ellipsis width={16} height={16} className="shrink-0" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === 'copy-share-code') void copyShareCode()
                  else if (key === 'manage-criteria') navigate('/console/criteria')
                }}
              >
                <Dropdown.Item id="copy-share-code" textValue="复制当前评分标准分享码">
                  <Copy width={15} height={15} className="shrink-0 text-fg-muted" />
                  <Label>复制当前评分标准分享码</Label>
                </Dropdown.Item>
                <Dropdown.Item id="manage-criteria" textValue="我创建的评分标准">
                  <ClipboardList width={15} height={15} className="shrink-0 text-fg-muted" />
                  <Label>我创建的评分标准</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        {student.stuId == null ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>未在本地名单中匹配到该学号。</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          items && (
            <CriteriaGrading
              items={items}
              states={states}
              extras={extras}
              onToggle={toggleCard}
              onScoreChange={setCardScore}
              onAppendixChange={setCardAppendix}
              onAdd={openAdd}
            />
          )
        )}

        <RemarkField stuId={stuId} experimentId={experimentId} />
      </div>

      <Modal state={criteriaState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ClipboardList width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>评分标准</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex min-h-[38vh] flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="输入评分标准分享码"
                    value={shareCode}
                    onChange={(event) => setShareCode(event.target.value)}
                    aria-label="评分标准分享码"
                  />
                  <IconAction
                    label="加载"
                    size="md"
                    variant="secondary"
                    isPending={loading}
                    isDisabled={shareCode.trim() === ''}
                    onPress={() => void loadCriteria()}
                  >
                    <FileDown width={15} height={15} className="shrink-0" />
                  </IconAction>
                  <IconAction
                    label="创建"
                    size="md"
                    variant="secondary"
                    onPress={() => navigate(`/console/reports/${experimentId}/criteria/new`)}
                  >
                    <Plus width={15} height={15} className="shrink-0" />
                  </IconAction>
                </div>
                {loadedCriteria && (
                  <>
                    <CriteriaPreview items={loadedCriteria} />
                    <Button className="w-full" onPress={confirmCriteria}>
                      确认
                    </Button>
                  </>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={addState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Plus width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>添加卡片</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <div className="flex shrink-0 self-start overflow-hidden rounded-lg border border-line text-xs">
                  <button
                    type="button"
                    onClick={() => setNewMode('add')}
                    className={cn(
                      'px-2.5 py-1.5 transition-colors',
                      newMode === 'add'
                        ? 'bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    加分
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMode('subtract')}
                    className={cn(
                      'border-l border-line px-2.5 py-1.5 transition-colors',
                      newMode === 'subtract'
                        ? 'bg-danger/10 font-semibold text-danger'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    扣分
                  </button>
                </div>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  placeholder="分值（固定值，不支持范围）"
                  value={newScore}
                  onChange={(event) => setNewScore(event.target.value)}
                  aria-label="分值"
                />
                <Input
                  placeholder="规则（写在评语中）"
                  value={newRule}
                  onChange={(event) => setNewRule(event.target.value)}
                  aria-label="规则"
                />
                <TextArea
                  rows={2}
                  variant="secondary"
                  placeholder="详细标准"
                  value={newDetail}
                  onChange={(event) => setNewDetail(event.target.value)}
                  aria-label="详细标准"
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={addState.close}>
                  取消
                </Button>
                <Button isDisabled={newScore.trim() === ''} onPress={submitAdd}>
                  添加
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={rangeState}
        icon={TriangleAlert}
        tone="brand"
        title="分数超出范围"
        description="你确定要将分数值设置为在0~100以外的数目吗？"
        confirmLabel="确定"
        isPending={savingReport}
        onConfirm={confirmOutOfRange}
      />
    </div>
  )
}
