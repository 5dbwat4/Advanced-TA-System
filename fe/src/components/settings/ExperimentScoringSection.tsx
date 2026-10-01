import { Alert, Button, Modal, Spinner, Switch, useOverlayState } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import Percent from '~icons/lucide/percent'
import { ScoreRatioEditor } from '@/components/settings/ScoreRatioEditor'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { apiFetch, fetchClassSettings, updateClassSettings, type Experiment } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { DEFAULT_SCORE_RATIO, sanitizeScoreRatio } from '@/lib/scoring'
import { useCurrentClass } from '@/lib/store'
import { useDebouncedSave } from '@/lib/use-class-settings'

export function ExperimentScoringSection({ index }: { index: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unified, setUnified] = useState(false)
  const [ratio, setRatio] = useState<number[]>(DEFAULT_SCORE_RATIO)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [draft, setDraft] = useState<number[]>(DEFAULT_SCORE_RATIO)

  const oneClickState = useOverlayState()

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [{ settings }, expRes] = await Promise.all([
          fetchClassSettings(classId),
          apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
        ])
        if (cancelled) return
        setUnified(Boolean(settings.scoreRatioUnified))
        setRatio(sanitizeScoreRatio(settings.scoreRatio))
        setExperiments(expRes.experiments.filter((exp) => exp.classId === classId))
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载课程设置失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [classId])

  const syncFromServer = useCallback(async () => {
    if (!classId) return
    try {
      const { settings } = await fetchClassSettings(classId)
      setUnified(Boolean(settings.scoreRatioUnified))
      setRatio(sanitizeScoreRatio(settings.scoreRatio))
    } catch {
      // 回滚失败时忽略，保持乐观值
    }
  }, [classId])

  const patch = useCallback(
    async (body: Parameters<typeof updateClassSettings>[1]) => {
      if (!classId) return false
      setSaving(true)
      try {
        await updateClassSettings(classId, body)
        return true
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        await syncFromServer()
        return false
      } finally {
        setSaving(false)
      }
    },
    [classId, syncFromServer],
  )

  const ratioSave = useDebouncedSave(async () => {
    const ok = await patch({ scoreRatio: ratio })
    if (!ok) throw new Error('score ratio save failed')
  }, 700)

  const toggleUnified = (selected: boolean) => {
    ratioSave.cancel()
    setUnified(selected)
    void patch({ scoreRatioUnified: selected, scoreRatio: ratio })
  }

  const changeRatio = (next: number[]) => {
    ratioSave.schedule()
    setRatio(next)
  }

  const openOneClick = () => {
    setDraft(ratio)
    oneClickState.open()
  }

  const applyToAll = async () => {
    if (!classId) return
    const experimentScoreRatios = Object.fromEntries(
      experiments.map((experiment) => [experiment.id, draft]),
    )
    setSaving(true)
    try {
      const { settings } = await updateClassSettings(classId, {
        scoreRatio: draft,
        experimentScoreRatios,
      })
      setRatio(sanitizeScoreRatio(settings.scoreRatio))
      setDraft(sanitizeScoreRatio(settings.scoreRatio))
      toast.success(`已应用到 ${experiments.length} 个实验`)
      oneClickState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const busy = loading || saving

  return (
    <Card index={index}>
      <SectionHeader icon={Percent} busy={busy}>
        实验计分方式
      </SectionHeader>

      {!classId ? (
        <p className="mt-3 text-xs text-fg-subtle">请先在右上角选择或绑定一个课程。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg-muted">实验各项目采用统一评分占比</div>
              <div className="text-[11px] text-fg-subtle">开启后全课程所有实验共用下方评分占比</div>
            </div>
            <Switch
              aria-label="实验各项目采用统一评分占比"
              isSelected={unified}
              isDisabled={busy}
              onChange={toggleUnified}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          {unified ? (
            <div className="rounded-xl border border-line px-4 py-4">
              <div className="mb-3 text-xs font-semibold text-fg-muted">评分占比</div>
              <ScoreRatioEditor value={ratio} onChange={changeRatio} disabled={loading} />
            </div>
          ) : (
            <Button variant="secondary" className="self-start" onPress={openOneClick}>
              一键应用评分占比
            </Button>
          )}

          {ratioSave.saveFailed && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>自动保存失败，修改尚未保存</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </div>
      )}

      <Modal state={oneClickState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Percent width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>一键应用评分占比</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <p className="text-xs text-fg-subtle">
                  将下方占比应用到本课程的全部 {experiments.length} 个实验。
                </p>
                <ScoreRatioEditor value={draft} onChange={setDraft} />
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button
                  isPending={saving}
                  isDisabled={experiments.length === 0}
                  onPress={() => void applyToAll()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      应用到所有实验
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </Card>
  )
}
