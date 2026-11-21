import {
  Button,
  Modal,
  Spinner,
  useOverlayState,
} from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import Check from '~icons/lucide/check'
import GraduationCap from '~icons/lucide/graduation-cap'

import { HomeworkSelect } from '@/components/experiments/ExperimentDetailParts'
import {
  fetchExperimentHomeworks,
  updateExperiment,
  type Experiment,
  type ZjuamHomework,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

type ExperimentBindHomeworkModalProps = {
  state: ReturnType<typeof useOverlayState>
  experiment: Experiment
  onSaved: (experiment: Experiment) => void
}

export function ExperimentBindHomeworkModal({
  state,
  experiment,
  onSaved,
}: ExperimentBindHomeworkModalProps) {
  const [homeworks, setHomeworks] = useState<ZjuamHomework[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutDraft, setCheckoutDraft] = useState<string | null>(null)
  const [reportDraft, setReportDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadHomeworks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { homeworks: list } = await fetchExperimentHomeworks(experiment.id)
      setHomeworks(list)
    } catch (err) {
      setError(getErrorMessage(err, '获取学在浙大作业失败'))
    } finally {
      setLoading(false)
    }
  }, [experiment.id])

  useEffect(() => {
    if (!state.isOpen) return
    setCheckoutDraft(experiment.xzzdBindIdCheckout)
    setReportDraft(experiment.xzzdBindIdReport)
    void loadHomeworks()
  }, [state.isOpen, experiment.id, experiment.xzzdBindIdCheckout, experiment.xzzdBindIdReport, loadHomeworks])

  const save = async () => {
    setSaving(true)
    try {
      const { experiment: updated } = await updateExperiment(experiment.id, {
        xzzdBindIdCheckout: checkoutDraft,
        xzzdBindIdReport: reportDraft,
      })
      onSaved(updated)
      toast.success('已保存学在浙大作业绑定')
      state.close()
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <GraduationCap width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>绑定学在浙大作业</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-fg-muted">
                  <Spinner size="sm" />
                  正在从学在浙大获取作业…
                </div>
              ) : error ? (
                <div className="flex flex-col items-start gap-3 py-1">
                  <p className="text-sm text-danger">{error}</p>
                  <Button size="sm" variant="secondary" onPress={() => void loadHomeworks()}>
                    重试
                  </Button>
                </div>
              ) : homeworks.length === 0 ? (
                <p className="py-1 text-sm text-fg-muted">该课程暂无可绑定的作业。</p>
              ) : (
                <>
                  <HomeworkSelect
                    label="验收作业"
                    value={checkoutDraft}
                    homeworks={homeworks}
                    disabled={saving}
                    onChange={setCheckoutDraft}
                  />
                  <HomeworkSelect
                    label="报告作业"
                    value={reportDraft}
                    homeworks={homeworks}
                    disabled={saving}
                    onChange={setReportDraft}
                  />
                  <p className="text-[11px] text-fg-subtle">
                    验收与报告是两个不同的学在浙大作业，可分别绑定；不绑定可点击右侧清除。
                  </p>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <Button
                isPending={saving}
                isDisabled={loading || Boolean(error)}
                onPress={save}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <Check width={16} height={16} className="shrink-0" />
                    )}
                    保存
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
