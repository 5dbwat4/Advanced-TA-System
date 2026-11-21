import { Button, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import Check from '~icons/lucide/check'
import Download from '~icons/lucide/download'
import FlipHorizontal2 from '~icons/lucide/flip-horizontal-2'
import Import from '~icons/lucide/import'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import SquareCheckBig from '~icons/lucide/square-check-big'
import Trash2 from '~icons/lucide/trash-2'

import type { FocusStudentsViewTab } from '@/components/focus-students/types'
import { IconAction } from '@/components/ui/IconAction'
import { SearchInput } from '@/components/ui/SearchInput'

type FocusStudentsToolbarProps = {
  editing: boolean
  selectedCount: number
  query: string
  tab: FocusStudentsViewTab
  onQueryChange: (value: string) => void
  onTabChange: (tab: FocusStudentsViewTab) => void
  onToggleEditing: () => void
  onSelectAll: () => void
  onInvertSelection: () => void
  onDeleteSelected: () => void
  onImport: () => void
  onExport: () => void
  onAdd: () => void
}

export function FocusStudentsToolbar({
  editing,
  selectedCount,
  query,
  tab,
  onQueryChange,
  onTabChange,
  onToggleEditing,
  onSelectAll,
  onInvertSelection,
  onDeleteSelected,
  onImport,
  onExport,
  onAdd,
}: FocusStudentsToolbarProps) {
  const searchBox = (
    <SearchInput
      value={query}
      onChange={onQueryChange}
      placeholder="搜索"
      ariaLabel="搜索重点关注学生"
      className="min-w-[12rem] flex-1"
    />
  )

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {editing ? (
        <>
          <IconAction label="完成" variant="secondary" onPress={onToggleEditing}>
            <Check width={15} height={15} className="shrink-0" />
          </IconAction>
          {searchBox}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <IconAction
              label="删除所选"
              variant="danger-soft"
              onPress={onDeleteSelected}
            >
              <Trash2 width={15} height={15} className="shrink-0" />
            </IconAction>
            <IconAction label="反选" variant="secondary" onPress={onInvertSelection}>
              <FlipHorizontal2 width={15} height={15} className="shrink-0" />
            </IconAction>
            <IconAction label="全选" variant="secondary" onPress={onSelectAll}>
              <SquareCheckBig width={15} height={15} className="shrink-0" />
            </IconAction>
            <span className="tabular text-xs font-semibold text-fg-muted">
              当前已选中（{selectedCount}）
            </span>
          </div>
        </>
      ) : (
        <>
          <IconAction label="编辑" variant="secondary" onPress={onToggleEditing}>
            <Pen width={15} height={15} className="shrink-0" />
          </IconAction>
          {searchBox}
          <IconAction label="一键导入" variant="ghost" onPress={onImport}>
            <Import width={15} height={15} className="shrink-0" />
          </IconAction>
          <Button size="sm" variant="secondary" onPress={onExport}>
            <Download width={15} height={15} className="shrink-0" />
            导出
          </Button>
          <Button size="sm" variant="primary" onPress={onAdd}>
            <Plus width={15} height={15} className="shrink-0" />
            添加
          </Button>
          <div className="ms-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-fg-muted">查看</span>
            <ToggleButtonGroup
              selectionMode="single"
              disallowEmptySelection
              size="sm"
              selectedKeys={new Set([tab])}
              onSelectionChange={(keys) => {
                const first = keys.values().next().value
                if (first != null) onTabChange(String(first) as FocusStudentsViewTab)
              }}
            >
              <ToggleButton id="basic">基本信息</ToggleButton>
              <ToggleButton id="scores">
                <ToggleButtonGroup.Separator />
                成绩情况
              </ToggleButton>
              <ToggleButton id="actions">
                <ToggleButtonGroup.Separator />
                操作
              </ToggleButton>
              <ToggleButton id="all">
                <ToggleButtonGroup.Separator />
                全部
              </ToggleButton>
            </ToggleButtonGroup>
          </div>
        </>
      )}
    </div>
  )
}
