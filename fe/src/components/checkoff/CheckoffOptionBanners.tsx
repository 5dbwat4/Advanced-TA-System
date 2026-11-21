import { Button } from '@heroui/react'
import Dices from '~icons/lucide/dices'
import NotebookText from '~icons/lucide/notebook-text'

import type { SpecialDrawMachine } from '@/lib/special-draw'

type CheckoffOptionBannersProps = {
  specialMachine: SpecialDrawMachine | null
  bankOverrideActive: boolean
  bankOverrideName?: string
  onEditSpecialDraw: () => void
  onResetSpecialDraw: () => void
  onEditBank: () => void
  onResetBank: () => void
}

export function CheckoffOptionBanners({
  specialMachine,
  bankOverrideActive,
  bankOverrideName,
  onEditSpecialDraw,
  onResetSpecialDraw,
  onEditBank,
  onResetBank,
}: CheckoffOptionBannersProps) {
  return (
    <>
      {specialMachine && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs">
          <Dices width={15} height={15} className="shrink-0 text-brand-600 dark:text-brand-300" />
          <span className="font-semibold text-fg">特殊的抽题方式已启用</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onPress={onEditSpecialDraw}>
              编辑
            </Button>
            <Button size="sm" variant="ghost" onPress={onResetSpecialDraw}>
              恢复默认
            </Button>
          </div>
        </div>
      )}

      {bankOverrideActive && !specialMachine && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs">
          <NotebookText
            width={15}
            height={15}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span className="font-semibold text-fg">已使用其它题目集</span>
          {bankOverrideName && <span className="text-fg-muted">{bankOverrideName}</span>}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onPress={onEditBank}>
              编辑
            </Button>
            <Button size="sm" variant="ghost" onPress={onResetBank}>
              恢复默认
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
