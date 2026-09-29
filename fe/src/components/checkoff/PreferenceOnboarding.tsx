import { Button, NumberField, Spinner, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { useState } from 'react'

import Check from '~icons/lucide/check'
import Dices from '~icons/lucide/dices'
import Laptop from '~icons/lucide/laptop'
import ListChecks from '~icons/lucide/list-checks'
import MonitorSmartphone from '~icons/lucide/monitor-smartphone'
import Rocket from '~icons/lucide/rocket'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'
import { PreferenceRow } from '@/components/settings/PreferenceRow'
import { Card } from '@/components/ui/Card'
import type { UserPreferences } from '@/lib/api'
import type { IconComponent } from '@/lib/icon'
import { cn } from '@/lib/utils'

function ChoiceCard({
  selected,
  icon: Ico,
  title,
  desc,
  onSelect,
  showIcon = true,
}: {
  selected: boolean
  icon: IconComponent
  title: string
  desc: string
  onSelect: () => void
  showIcon?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onPress={onSelect}
      className={cn(
        'relative h-auto w-full flex-col items-start justify-start gap-2 whitespace-normal rounded-2xl border-2 p-5 text-left transition-all',
        selected
          ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/25'
          : 'border-line bg-elevated hover:border-brand-500/40 hover:bg-brand-500/5',
      )}
    >
      {showIcon && (
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            selected
              ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
              : 'bg-sunken text-fg-muted',
          )}
        >
          <Ico width={19} height={19} className="shrink-0" />
        </span>
      )}
      <span className="text-sm font-bold text-fg">{title}</span>
      <span className="text-xs font-normal text-fg-subtle">{desc}</span>
      {selected && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md">
          <Check width={12} height={12} className="shrink-0" />
        </span>
      )}
    </Button>
  )
}

function DrawCountField({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <NumberField
      aria-label="自定义抽题数目"
      variant="secondary"
      minValue={1}
      maxValue={10}
      value={value}
      onChange={(next) => onChange(next ?? 1)}
    >
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input className="w-14 text-center tabular-nums" />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  )
}

export function PreferenceFields({
  device,
  draw,
  drawCount,
  onDeviceChange,
  onDrawChange,
  onDrawCountChange,
  showIcon = true,
  layout = 'cards',
}: {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  drawCount: number
  onDeviceChange: (value: 'single' | 'multi') => void
  onDrawChange: (value: 'random' | 'fixed') => void
  onDrawCountChange: (value: number) => void
  showIcon?: boolean
  layout?: 'cards' | 'rows'
}) {
  if (layout === 'rows') {
    return (
      <div className="flex flex-col gap-3">
        <PreferenceRow
          title="是否打算使用多台设备？"
          hint={device === 'single' ? '一台设备完成抽题与评分' : '分屏协作，一台抽题一台评分'}
        >
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            size="sm"
            selectedKeys={new Set([device])}
            onSelectionChange={(keys) => {
              const first = keys.values().next().value
              if (first != null) onDeviceChange(String(first) as 'single' | 'multi')
            }}
          >
            <ToggleButton id="single">单设备</ToggleButton>
            <ToggleButton id="multi">
              <ToggleButtonGroup.Separator />
              多设备
            </ToggleButton>
          </ToggleButtonGroup>
        </PreferenceRow>

        <PreferenceRow
          title="希望随机抽题还是固定选题？"
          hint={draw === 'random' ? '现场为每位学生随机抽取题目' : '从题库中手动挑选题目'}
        >
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            size="sm"
            selectedKeys={new Set([draw])}
            onSelectionChange={(keys) => {
              const first = keys.values().next().value
              if (first != null) onDrawChange(String(first) as 'random' | 'fixed')
            }}
          >
            <ToggleButton id="random">随机抽题</ToggleButton>
            <ToggleButton id="fixed">
              <ToggleButtonGroup.Separator />
              选择题目
            </ToggleButton>
          </ToggleButtonGroup>
        </PreferenceRow>

        <PreferenceRow title="自定义抽题数目" hint="现场随机抽题时抽取的题目数量">
          <DrawCountField value={drawCount} onChange={onDrawCountChange} />
        </PreferenceRow>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-fg">是否打算使用多台设备？</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={device === 'single'}
            icon={Laptop}
            title="单设备"
            desc="一台设备完成抽题与评分"
            onSelect={() => onDeviceChange('single')}
            showIcon={showIcon}
          />
          <ChoiceCard
            selected={device === 'multi'}
            icon={MonitorSmartphone}
            title="多设备"
            desc="分屏协作，一台抽题一台评分"
            onSelect={() => onDeviceChange('multi')}
            showIcon={showIcon}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-fg">希望随机抽题还是固定选题？</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={draw === 'random'}
            icon={Dices}
            title="随机抽题"
            desc="现场为每位学生随机抽取题目"
            onSelect={() => onDrawChange('random')}
            showIcon={showIcon}
          />
          <ChoiceCard
            selected={draw === 'fixed'}
            icon={ListChecks}
            title="选择题目"
            desc="从题库中手动挑选题目"
            onSelect={() => onDrawChange('fixed')}
            showIcon={showIcon}
          />
        </div>
      </div>

      <PreferenceRow title="自定义抽题数目" hint="现场随机抽题时抽取的题目数量">
        <DrawCountField value={drawCount} onChange={onDrawCountChange} />
      </PreferenceRow>
    </>
  )
}

export function PreferenceOnboarding({
  initial,
  onSubmit,
  onCancel,
  layout = 'cards',
}: {
  initial: UserPreferences | null
  onSubmit: (prefs: UserPreferences) => Promise<void>
  onCancel?: () => void
  layout?: 'cards' | 'rows'
}) {
  const [device, setDevice] = useState<'single' | 'multi'>(initial?.device ?? 'single')
  const [draw, setDraw] = useState<'random' | 'fixed'>(initial?.draw ?? 'random')
  const [drawCount, setDrawCount] = useState<number>(initial?.drawCount ?? 3)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onSubmit({
        device,
        draw,
        markdownEditor: initial?.markdownEditor ?? 'uiw',
        markdownStyle: initial?.markdownStyle ?? 'github',
        drawCount,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-6 p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300">
          <SlidersHorizontal width={21} height={21} className="shrink-0" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-fg">偏好选择</h2>
          <p className="text-xs text-fg-subtle">开始验收前，请先确认你的验收方式</p>
        </div>
      </div>

      <PreferenceFields
        device={device}
        draw={draw}
        drawCount={drawCount}
        onDeviceChange={setDevice}
        onDrawChange={setDraw}
        onDrawCountChange={setDrawCount}
        layout={layout}
      />

      <div className="flex justify-end gap-2">
        {initial && onCancel && (
          <Button type="button" variant="ghost" onPress={onCancel} isDisabled={saving}>
            取消
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          isPending={saving}
          onPress={save}
          className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <Rocket width={16} height={16} className="shrink-0" />
              )}
              {initial ? '保存' : '开始验收'}
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
