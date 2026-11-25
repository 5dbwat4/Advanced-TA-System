import { Button, Input, Modal, useOverlayState } from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import ClipboardList from '~icons/lucide/clipboard-list'
import FileDown from '~icons/lucide/file-down'
import { CriteriaPreview } from '@/components/criteria/CriteriaPreview'
import { CriteriaRow } from '@/components/criteria/CriteriaRow'
import type { CriterionItem } from '@/components/criteria/types'
import { PendingButton } from '@/components/ui/PendingButton'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { fetchCriteria, fetchCriteriaList, type CriteriaSummary } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

import { saveLocalDefaultRule, type LocalDefaultRule } from './default-rule'

/** 评分标准弹窗：输入分享码加载后，套用到当前学生（从批改面板打开时）或设为本实验默认 */
export function CriteriaModal({
  state,
  experimentId,
  showStudentAction,
  onApply,
  onDefaultApplied,
}: {
  state: ReturnType<typeof useOverlayState>
  experimentId: string
  /** 是否显示「为该学生设定」（仅从批改面板打开时为 true） */
  showStudentAction?: boolean
  /** 套用到当前学生 */
  onApply?: (items: CriterionItem[], key: string) => void
  /** 设为本实验默认后通知（用于即时更新内存态） */
  onDefaultApplied?: (rule: LocalDefaultRule) => void
}) {
  const [shareCode, setShareCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadedCriteria, setLoadedCriteria] = useState<CriterionItem[] | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [list, setList] = useState<CriteriaSummary[]>([])
  const [listLoading, setListLoading] = useState(false)

  useEffect(() => {
    if (!state.isOpen) return
    setShareCode('')
    setLoadedCriteria(null)
    setLoadedKey(null)
    let cancelled = false
    setListLoading(true)
    fetchCriteriaList()
      .then((res) => {
        if (!cancelled) setList(res.criteria)
      })
      .catch(() => {
        if (!cancelled) setList([])
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [state.isOpen])

  const loadCriteria = async (rawCode?: string) => {
    const code = (rawCode ?? shareCode).trim().toLowerCase()
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

  const selectCriteria = (item: CriteriaSummary) => {
    setShareCode(item.key)
    void loadCriteria(item.key)
  }

  const confirmCriteria = () => {
    if (!loadedCriteria || !loadedKey) return
    onApply?.(loadedCriteria, loadedKey)
    state.close()
    toast.success('已应用评分标准')
  }

  /** 设为该实验的默认评分标准：本实验下所有未批改报告统一使用它（本地持久化） */
  const applyDefaultRule = () => {
    if (!loadedCriteria || !loadedKey) return
    const rule: LocalDefaultRule = { key: loadedKey, items: loadedCriteria }
    void saveLocalDefaultRule(experimentId, rule)
    onDefaultApplied?.(rule)
    state.close()
    toast.success('已为本实验的未批改报告设置此评分标准（本地）')
  }

  return (
    <Modal state={state}>
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
                <PendingButton
                  variant="secondary"
                  icon={FileDown}
                  pendingLabel="加载中"
                  isPending={loading}
                  isDisabled={shareCode.trim() === ''}
                  onPress={() => void loadCriteria()}
                >
                  加载
                </PendingButton>
              </div>
              {shareCode.trim() === '' && (
                <div className="flex max-h-[45vh] min-h-0 flex-col gap-2 overflow-auto">
                  {listLoading ? (
                    <SkeletonList rows={3} className="h-14 rounded-xl" />
                  ) : list.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-fg-subtle">
                      暂无可见的评分标准
                    </p>
                  ) : (
                    list.map((item) => (
                      <CriteriaRow
                        key={item.key}
                        item={item}
                        onSelect={selectCriteria}
                        onView={selectCriteria}
                      />
                    ))
                  )}
                </div>
              )}
              {loadedCriteria && (
                <>
                  <CriteriaPreview items={loadedCriteria} />
                  {showStudentAction && (
                    <Button className="w-full" onPress={confirmCriteria}>
                      为该学生设定
                    </Button>
                  )}
                  <Button
                    variant={showStudentAction ? 'secondary' : 'primary'}
                    className="w-full"
                    onPress={applyDefaultRule}
                  >
                    为该实验所有未批报告使用该评分标准
                  </Button>
                </>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
