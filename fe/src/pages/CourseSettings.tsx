import { Alert, Button, CloseButton, ListBox, Select, Switch } from '@heroui/react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimeoutFn } from 'react-use'

import SlidersHorizontal from '~icons/lucide/sliders-horizontal'
import { CommentTemplateSection } from '@/components/settings/CommentTemplateSection'
import { ExperimentScoringSection } from '@/components/settings/ExperimentScoringSection'
import { FocusStudentsSection } from '@/components/settings/FocusStudentsSection'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { TableOfContents, type TocItem } from '@/components/ui/TableOfContents'
import { useClassSettingsPatch } from '@/lib/use-class-settings'
import { useScrollToHash } from '@/lib/hash'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

const CHECKPOINT_RULES = [{ value: 'lab0-zero', label: 'Lab 0 置为0分' }]

const SECTIONS: TocItem[] = [
  { id: 'checkpoint', label: 'Checkpoint Settings' },
  { id: 'scoring', label: '实验计分方式' },
  { id: 'focus', label: '重点关注学生' },
  { id: 'comment', label: '评语模板' },
  { id: 'basic', label: '基本信息' },
  { id: 'roster', label: '学生名单' },
  { id: 'tas', label: '助教' },
  { id: 'xzzd', label: '学在浙大' },
]

const PLACEHOLDER_SECTIONS = SECTIONS.filter(
  (section) =>
    section.id !== 'checkpoint' &&
    section.id !== 'scoring' &&
    section.id !== 'focus' &&
    section.id !== 'comment',
)

export default function CourseSettings() {
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [, , resetHighlight] = useTimeoutFn(() => setHighlightId(null), 1600)

  useScrollToHash(
    useCallback(
      (id: string) => {
        setHighlightId(id)
        resetHighlight()
      },
      [resetHighlight],
    ),
  )

  const sectionClass = (id: string) =>
    cn(
      'scroll-mt-24 rounded-2xl transition-shadow duration-300',
      highlightId === id && 'ring-2 ring-brand-500/40 dark:ring-brand-400/50',
    )
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="课程设置" />

      <div className="flex items-start gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section id="checkpoint" className={sectionClass('checkpoint')}>
            <CheckpointSettingsSection index={0} />
          </section>

          <section id="scoring" className={sectionClass('scoring')}>
            <ExperimentScoringSection index={1} />
          </section>

          <section id="focus" className={sectionClass('focus')}>
            <FocusStudentsSection index={2} />
          </section>

          <section id="comment" className={sectionClass('comment')}>
            <CommentTemplateSection index={3} />
          </section>

          {PLACEHOLDER_SECTIONS.map((section, index) => (
            <section key={section.id} id={section.id} className={sectionClass(section.id)}>
              <Card index={index + 4}>
                <h2 className="text-sm font-bold">{section.label}</h2>
                <p className="mt-2 text-xs text-fg-subtle">此部分内容待补充。</p>
              </Card>
            </section>
          ))}
        </div>

        <TableOfContents items={SECTIONS} />
      </div>
    </div>
  )
}

function CheckpointSettingsSection({ index }: { index: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const {
    settings,
    settingsLoading: loading,
    patch,
    saving,
    rollbackFailed,
    dismissRollbackFailure,
  } = useClassSettingsPatch(classId)

  const busy = loading || saving

  return (
    <Card index={index}>
      <SectionHeader icon={SlidersHorizontal} busy={busy}>
        Checkpoint Settings
      </SectionHeader>

      {!classId ? (
        <p className="mt-3 text-xs text-fg-subtle">请先在右上角选择或绑定一个课程。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg-muted">开启 Checkpoint 机制</div>
              <div className="text-[11px] text-fg-subtle">
                开启后按下方规则自动应用 Checkpoint 判分
              </div>
            </div>
            <Switch
              aria-label="开启Checkpoint机制"
              isSelected={settings?.checkpointEnabled ?? false}
              isDisabled={busy}
              onChange={(selected) =>
                void patch({ checkpointEnabled: selected }, (prev) => ({
                  ...prev,
                  checkpointEnabled: selected,
                }))
              }
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="text-xs font-semibold text-fg-muted">Checkpoint 规则</div>
            <Select
              className="min-w-[12rem]"
              aria-label="Checkpoint规则"
              isDisabled={busy}
              value={settings?.checkpointRule ?? null}
              placeholder="未选择规则"
              onChange={(key) =>
                void patch({ checkpointRule: key == null ? null : String(key) }, (prev) => ({
                  ...prev,
                  checkpointRule: key == null ? null : String(key),
                }))
              }
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {CHECKPOINT_RULES.map((item) => (
                    <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
                      {item.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <Button
            variant="secondary"
            className="self-start"
            onPress={() => navigate('/console/courses/checkpoints')}
          >
            管理 Checkpoints
          </Button>

          {rollbackFailed && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>设置保存失败且无法恢复，请刷新页面</Alert.Description>
              </Alert.Content>
              <CloseButton aria-label="关闭" onPress={dismissRollbackFailure} />
            </Alert>
          )}
        </div>
      )}
    </Card>
  )
}
