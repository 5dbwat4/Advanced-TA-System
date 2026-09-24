import { Button, Spinner } from '@heroui/react'
import { useState } from 'react'

import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import type { UserPreferences } from '@/lib/api'
import { cn } from '@/lib/utils'

function ChoiceCard({
  selected,
  icon,
  title,
  desc,
  onSelect,
  showIcon = true,
}: {
  selected: boolean
  icon: string
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
          <Icon icon={icon} width={19} />
        </span>
      )}
      <span className="text-sm font-bold text-fg">{title}</span>
      <span className="text-xs font-normal text-fg-subtle">{desc}</span>
      {selected && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md">
          <Icon icon="lucide:check" width={12} />
        </span>
      )}
    </Button>
  )
}

export function PreferenceFields({
  device,
  draw,
  onDeviceChange,
  onDrawChange,
  showIcon = true,
}: {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  onDeviceChange: (value: 'single' | 'multi') => void
  onDrawChange: (value: 'random' | 'fixed') => void
  showIcon?: boolean
}) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-fg">是否打算使用多台设备？</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={device === 'single'}
            icon="lucide:laptop"
            title="单设备"
            desc="一台设备完成抽题与评分"
            onSelect={() => onDeviceChange('single')}
            showIcon={showIcon}
          />
          <ChoiceCard
            selected={device === 'multi'}
            icon="lucide:monitor-smartphone"
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
            icon="lucide:dices"
            title="随机抽题"
            desc="现场为每位学生随机抽取题目"
            onSelect={() => onDrawChange('random')}
            showIcon={showIcon}
          />
          <ChoiceCard
            selected={draw === 'fixed'}
            icon="lucide:list-checks"
            title="选择题目"
            desc="从题库中手动挑选题目"
            onSelect={() => onDrawChange('fixed')}
            showIcon={showIcon}
          />
        </div>
      </div>
    </>
  )
}

export function PreferenceOnboarding({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: UserPreferences | null
  onSubmit: (prefs: UserPreferences) => Promise<void>
  onCancel?: () => void
}) {
  const [device, setDevice] = useState<'single' | 'multi'>(initial?.device ?? 'single')
  const [draw, setDraw] = useState<'random' | 'fixed'>(initial?.draw ?? 'random')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onSubmit({ device, draw })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-6 p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300">
          <Icon icon="lucide:sliders-horizontal" width={21} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-fg">偏好选择</h2>
          <p className="text-xs text-fg-subtle">开始验收前，请先确认你的验收方式</p>
        </div>
      </div>

      <PreferenceFields
        device={device}
        draw={draw}
        onDeviceChange={setDevice}
        onDrawChange={setDraw}
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
                <Icon icon="lucide:rocket" width={16} />
              )}
              {initial ? '保存' : '开始验收'}
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
