import { Button, Input, Modal, Spinner, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import Copy from '~icons/lucide/copy'
import FileDown from '~icons/lucide/file-down'
import ListChecks from '~icons/lucide/list-checks'
import Save from '~icons/lucide/save'
import Share2 from '~icons/lucide/share-2'
import TriangleAlert from '~icons/lucide/triangle-alert'
import { CriteriaEditor } from '@/components/criteria/CriteriaEditor'
import { ImpactPreview } from '@/components/criteria/ImpactPreview'
import { computeCriteriaImpact, type CriteriaImpactResult } from '@/components/criteria/impact'
import type { CriterionItem } from '@/components/criteria/types'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PendingButton } from '@/components/ui/PendingButton'
import { fetchCriteria, fetchCriteriaImpact, saveCriteria, updateCriteria } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

function impactKey(item: { stuId: string; experimentId: string }): string {
  return `${item.stuId}-${item.experimentId}`
}

const SHARE_CODE_PATTERN = /^[0-9a-f]{48}$/i

export default function ReportCriteria() {
  const { id, key } = useParams<{ id?: string; key?: string }>()
  const navigate = useNavigate()
  const importState = useOverlayState()
  const overwriteState = useOverlayState()
  const impactState = useOverlayState()

  const [items, setItems] = useState<CriterionItem[]>([])
  const [shareKey, setShareKey] = useState<string | null>(key ?? null)
  const [usageCount, setUsageCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [impact, setImpact] = useState<CriteriaImpactResult | null>(null)
  const [impactOldItems, setImpactOldItems] = useState<CriterionItem[]>([])
  const [impactSelected, setImpactSelected] = useState<string | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)

  const editing = Boolean(key)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setLoading(true)
    fetchCriteria(key)
      .then((res) => {
        if (cancelled) return
        const payload = res.payload as { items?: CriterionItem[] } | null
        if (!payload || !Array.isArray(payload.items)) {
          toast.error('评分标准内容无效')
          return
        }
        setItems(payload.items)
        setUsageCount(res.usageCount ?? 0)
      })
      .catch((err) => {
        if (!cancelled) toast.error(getErrorMessage(err, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  /** 保存：编辑模式原地覆盖（保留分享码），创建模式生成新分享码 */
  const persist = async (): Promise<string | null> => {
    setSaving(true)
    try {
      if (key) {
        const res = await updateCriteria(key, { version: 1, items })
        setShareKey(res.key)
        toast.success('已保存评分标准')
        return res.key
      }
      const res = await saveCriteria({ version: 1, items })
      setShareKey(res.key)
      toast.success('已保存评分标准')
      return res.key
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'))
      return null
    } finally {
      setSaving(false)
    }
  }

  const share = async () => {
    const code = shareKey ?? (await persist())
    if (!code) return
    if (await copyToClipboard(code)) toast.success('分享码已复制')
    else toast.error('复制失败，请手动复制')
  }

  /** 保存入口：若标准已被批阅使用，先弹确认 */
  const requestSave = () => {
    if (editing && usageCount > 0) {
      overwriteState.open()
      return
    }
    void persist()
  }

  const confirmOverwrite = () => {
    void persist().finally(() => overwriteState.close())
  }

  /** 拉取并计算「当前编辑内容」对已有批阅的影响 */
  const openImpact = async () => {
    if (!key) return
    setImpact(null)
    setImpactLoading(true)
    impactState.open()
    try {
      const res = await fetchCriteriaImpact(key, { version: 1, items })
      const result = computeCriteriaImpact(res.oldItems, items, res.reviews)
      setImpactOldItems(res.oldItems)
      setImpact(result)
      setImpactSelected(result.items[0] ? impactKey(result.items[0]) : null)
    } catch (err) {
      toast.error(getErrorMessage(err, '加载失败'))
      impactState.close()
    } finally {
      setImpactLoading(false)
    }
  }

  /** 另存为副本：生成新分享码并跳到新标准的编辑页 */
  const saveAsCopy = async () => {
    setSaving(true)
    try {
      const res = await saveCriteria({ version: 1, items })
      toast.success('已另存为副本')
      navigate(`/console/criteria/${res.key}/edit`)
    } catch (err) {
      toast.error(getErrorMessage(err, '另存失败'))
    } finally {
      setSaving(false)
    }
  }

  const doImport = async () => {
    const code = importCode.trim().toLowerCase()
    if (!SHARE_CODE_PATTERN.test(code)) {
      toast.error('分享码格式不正确')
      return
    }
    setImporting(true)
    try {
      const res = await fetchCriteria(code)
      const payload = res.payload as { items?: CriterionItem[] } | null
      if (!payload || !Array.isArray(payload.items)) {
        toast.error('评分标准内容无效')
        return
      }
      setItems(payload.items)
      setShareKey(code)
      importState.close()
      setImportCode('')
      toast.success('已导入评分标准')
    } catch (err) {
      toast.error(getErrorMessage(err, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  const backTo = editing ? '/console/criteria' : id ? `/console/reports/${id}` : '/console/reports'
  const selectedImpact =
    impact?.items.find((item) => impactKey(item) === impactSelected) ?? impact?.items[0] ?? null

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0 flex-1 truncate text-sm font-bold">
          {editing ? '编辑评分标准' : '创建评分标准'}
        </div>
        {editing && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              usageCount > 0
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-sunken text-fg-subtle',
            )}
          >
            {usageCount > 0 ? `使用中 ${usageCount} 处` : '未被使用'}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {editing && usageCount > 0 && (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={saving || loading}
              onPress={() => void openImpact()}
            >
              <ListChecks width={15} height={15} className="shrink-0" />
              查看受影响评分
            </Button>
          )}
          <Button size="sm" variant="secondary" onPress={importState.open}>
            <FileDown width={15} height={15} className="shrink-0" />
            导入
          </Button>
          {editing && (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={saving || loading}
              onPress={() => void saveAsCopy()}
            >
              <Copy width={15} height={15} className="shrink-0" />
              另存为
            </Button>
          )}
          <Button size="sm" variant="secondary" onPress={() => void share()}>
            <Share2 width={15} height={15} className="shrink-0" />
            分享
          </Button>
          <PendingButton
            size="sm"
            isPending={saving}
            isDisabled={loading}
            icon={Save}
            onPress={requestSave}
          >
            保存
          </PendingButton>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl p-4">
          <CriteriaEditor items={items} onChange={setItems} />
        </div>
      </div>

      <Modal state={importState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <FileDown width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>导入评分标准</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Input
                  placeholder="输入 48 位分享码"
                  value={importCode}
                  onChange={(event) => setImportCode(event.target.value)}
                  aria-label="评分标准分享码"
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={importState.close}>
                  取消
                </Button>
                <PendingButton
                  isPending={importing}
                  icon={FileDown}
                  isDisabled={importCode.trim() === ''}
                  onPress={() => void doImport()}
                >
                  导入
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={impactState}>
        <Modal.Backdrop>
          <Modal.Container>
              <Modal.Dialog className="sm:max-w-5xl">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Icon className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <ListChecks width={18} height={18} className="shrink-0" />
                  </Modal.Icon>
                  <Modal.Heading>受影响的评分</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex h-[68vh] flex-col gap-3 overflow-hidden">
                {impactLoading ? (
                  <div className="flex flex-1 items-center justify-center py-10">
                    <Spinner size="lg" />
                  </div>
                ) : !impact || impact.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-fg-subtle">
                    没有评分会受到影响。
                  </p>
                ) : (
                  <>
                    <p className="shrink-0 text-xs text-fg-subtle">
                      共 {impact.total} 份批阅，其中 {impact.items.length} 份会受影响。
                    </p>
                    <div className="flex min-h-0 flex-1 gap-4">
                      <div className="flex w-56 shrink-0 flex-col gap-1 overflow-auto border-r border-line pe-3">
                        {impact.items.map((item) => {
                          const key = impactKey(item)
                          const active = selectedImpact != null && impactKey(selectedImpact) === key
                          const changeCount = item.changes.filter(
                            (change) => change.kind !== 'section',
                          ).length
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setImpactSelected(key)}
                              className={cn(
                                'flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                                active ? 'bg-brand-500/10 text-fg' : 'text-fg-muted hover:bg-sunken',
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {item.name}
                                </span>
                                <span className="tabular block text-[11px] text-fg-subtle">
                                  {item.studentNo} · {item.experimentMark}
                                </span>
                              </span>
                              {changeCount > 0 && (
                                <span className="tabular shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                  {changeCount}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <div className="min-w-0 flex-1 overflow-auto">
                        {selectedImpact && (
                          <ImpactPreview item={selectedImpact} oldItems={impactOldItems} />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={overwriteState}
        icon={TriangleAlert}
        tone="brand"
        title="评分标准正在被使用"
        confirmLabel="继续保存"
        isPending={saving}
        extraActions={
          <Button
            className="me-auto"
            variant="secondary"
            onPress={() => {
              overwriteState.close()
              void openImpact()
            }}
          >
            <ListChecks width={15} height={15} className="shrink-0" />
            查看受影响评分
          </Button>
        }
        description={
          <>
            你正在修改一个已被 <strong>{usageCount}</strong> 次使用的评分标准。如果继续保存，对已被批阅的评分：
            <br />· <strong>分数不会自动重算</strong>（已保存分数保持不变），但已批阅明细会按新的规则文本/分值显示；
            <br />· 新增卡片（含<strong>默认勾选</strong>的卡片）<strong>不会被勾选</strong>；
            <br />· 被删除的卡片，其此前的勾选与附注将不再显示；
            <br />
            若该分享码被多人共用，修改会同时影响所有使用它的人。你确定要继续吗？
          </>
        }
        onConfirm={confirmOverwrite}
      />
    </div>
  )
}
