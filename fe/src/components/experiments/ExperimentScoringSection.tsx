import { Alert, Spinner } from '@heroui/react'
import { Link } from 'react-router-dom'
import Percent from '~icons/lucide/percent'

import { ScoreRatioEditor } from '@/components/settings/ScoreRatioEditor'

type ExperimentScoringSectionProps = {
  readonly: boolean
  ratio: number[]
  unifiedRatio: boolean
  savingRatio: boolean
  saveFailed: boolean
  onChange: (next: number[]) => void
}

export function ExperimentScoringSection({
  readonly,
  ratio,
  unifiedRatio,
  savingRatio,
  saveFailed,
  onChange,
}: ExperimentScoringSectionProps) {
  return (
    <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Percent
            width={16}
            height={16}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span className="text-sm font-bold">实验计分方式</span>
        </div>
        {!readonly && savingRatio && <Spinner size="sm" />}
        {unifiedRatio && (
          <span className="text-xs text-fg-subtle">
            已启用课程统一评分占比，
            {readonly ? (
              '以课程设置为准'
            ) : (
              <Link
                to="/console/courses/settings#scoring"
                className="font-semibold text-brand-600 transition-colors hover:underline dark:text-brand-300"
              >
                前往设置修改
              </Link>
            )}
          </span>
        )}
      </div>
      <div className="mt-4">
        <ScoreRatioEditor
          value={ratio}
          onChange={onChange}
          disabled={readonly || unifiedRatio}
        />
        {!readonly && saveFailed && (
          <Alert className="mt-3" status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>自动保存失败，修改尚未保存</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>
    </div>
  )
}
