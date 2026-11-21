import { ListBox, Select, Spinner } from '@heroui/react'
import { Link } from 'react-router-dom'
import NotebookText from '~icons/lucide/notebook-text'
import TriangleAlert from '~icons/lucide/triangle-alert'

import type { QuestionBank } from '@/lib/api'

const MORE_BANKS_KEY = '__more__'

type ExperimentBankSectionProps = {
  readonly: boolean
  binding: boolean
  bank: { id: string; name: string } | null
  recentBanks: QuestionBank[]
  bankQuestionCount: number | null
  onBind: (bankId: string) => void
  onOpenBanks: () => void
}

export function ExperimentBankSection({
  readonly,
  binding,
  bank,
  recentBanks,
  bankQuestionCount,
  onBind,
  onOpenBanks,
}: ExperimentBankSectionProps) {
  if (readonly) return null

  return (
    <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <NotebookText
            width={16}
            height={16}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span className="text-sm font-bold">抽题题目集</span>
        </div>
        <Select
          className="min-w-[14rem]"
          aria-label="抽题题目集"
          isDisabled={binding}
          value={bank?.id ?? null}
          placeholder="未绑定题目集"
          onChange={(key) => {
            if (key === MORE_BANKS_KEY) {
              onOpenBanks()
              return
            }
            void onBind(key == null ? '' : String(key))
          }}
          onClear={() => void onBind('')}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.ClearButton />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {recentBanks.map((item) => (
                <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                  {item.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
              <ListBox.Item key={MORE_BANKS_KEY} id={MORE_BANKS_KEY} textValue="查看更多……">
                <span className="text-brand-600 dark:text-brand-300">查看更多……</span>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        {binding && <Spinner size="sm" />}
        {bankQuestionCount !== null && (
          <span className="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
            {bankQuestionCount} 题
          </span>
        )}
        <Link
          to="/console/questions?tab=sets"
          className="ml-auto text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          管理题目集 →
        </Link>
      </div>
      {!bank && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert width={13} height={13} className="shrink-0" />
          未绑定题目集时，验收抽题将没有题目。
        </p>
      )}
    </div>
  )
}
