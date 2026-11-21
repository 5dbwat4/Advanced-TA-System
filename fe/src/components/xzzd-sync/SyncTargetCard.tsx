import {
  Label,
  ListBox,
  Select,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react'
import Target from '~icons/lucide/target'

import { MappingField } from '@/components/xzzd-sync/parts'
import type { MappingDraft, ScoreType } from '@/components/xzzd-sync/types'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { Experiment } from '@/lib/api'
import { SCORE_TYPES } from '@/lib/scores'

type SyncTargetCardProps = {
  experiments: Experiment[]
  experimentId: string
  scoreType: ScoreType
  mappingEnabled: boolean
  mappingDraft: MappingDraft
  mappingError: string | null
  onExperimentChange: (id: string) => void
  onScoreTypeChange: (type: ScoreType) => void
  onMappingEnabledChange: (enabled: boolean) => void
  onMappingDraftChange: (updater: (prev: MappingDraft) => MappingDraft) => void
}

export function SyncTargetCard({
  experiments,
  experimentId,
  scoreType,
  mappingEnabled,
  mappingDraft,
  mappingError,
  onExperimentChange,
  onScoreTypeChange,
  onMappingEnabledChange,
  onMappingDraftChange,
}: SyncTargetCardProps) {
  return (
    <Card index={0}>
      <SectionHeader icon={Target}>1. 选择同步目标</SectionHeader>
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">
            本地实验
          </Label>
          <Select
            className="w-full"
            aria-label="选择本地实验"
            value={experimentId || null}
            placeholder={experiments.length === 0 ? '当前课程暂无实验' : '选择实验'}
            isDisabled={experiments.length === 0}
            onChange={(key) => {
              onExperimentChange(key == null ? '' : String(key))
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {experiments.map((experiment) => (
                  <ListBox.Item
                    key={experiment.id}
                    id={experiment.id}
                    textValue={`${experiment.mark} · ${experiment.title}`}
                  >
                    {experiment.mark} · {experiment.title}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-muted">写入评分项</div>
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={new Set([String(scoreType)])}
            onSelectionChange={(keys) => {
              const first = keys.values().next().value
              if (first != null) onScoreTypeChange(Number(first) as ScoreType)
            }}
          >
            {SCORE_TYPES.map((item, index) => (
              <ToggleButton key={item.value} id={String(item.value)}>
                {index > 0 && <ToggleButtonGroup.Separator />}
                {item.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <p className="mt-2 text-[11px] text-fg-subtle">
            学在浙大作业通常只有一个总分，请选择导入后对应的本地评分项。
          </p>
        </div>

        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-fg-muted">百分比映射</div>
              <div className="text-[11px] text-fg-subtle">
                将学在浙大成绩区间等比映射到本地成绩区间
              </div>
            </div>
            <Switch
              aria-label="启用百分比映射"
              isSelected={mappingEnabled}
              onChange={onMappingEnabledChange}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          {mappingEnabled && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MappingField
                  label="原成绩始"
                  value={mappingDraft.sourceMin}
                  onChange={(value) =>
                    onMappingDraftChange((prev) => ({ ...prev, sourceMin: value }))
                  }
                />
                <MappingField
                  label="原成绩末"
                  value={mappingDraft.sourceMax}
                  onChange={(value) =>
                    onMappingDraftChange((prev) => ({ ...prev, sourceMax: value }))
                  }
                />
                <MappingField
                  label="目标始"
                  value={mappingDraft.targetMin}
                  onChange={(value) =>
                    onMappingDraftChange((prev) => ({ ...prev, targetMin: value }))
                  }
                />
                <MappingField
                  label="目标末"
                  value={mappingDraft.targetMax}
                  onChange={(value) =>
                    onMappingDraftChange((prev) => ({ ...prev, targetMax: value }))
                  }
                />
              </div>
              {mappingError ? (
                <p className="text-[11px] text-danger">{mappingError}</p>
              ) : (
                <p className="text-[11px] text-fg-subtle">
                  映射规则：{mappingDraft.sourceMin}–{mappingDraft.sourceMax} →{' '}
                  {mappingDraft.targetMin}–{mappingDraft.targetMax}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
