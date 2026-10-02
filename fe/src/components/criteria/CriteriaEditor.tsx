import { Button, Checkbox, Dropdown, Input, Label, TextArea } from '@heroui/react'

import Plus from '~icons/lucide/plus'
import Rows3 from '~icons/lucide/rows-3'
import SquarePlus from '~icons/lucide/square-plus'
import Trash2 from '~icons/lucide/trash-2'
import { IconAction } from '@/components/ui/IconAction'
import { cn } from '@/lib/utils'

import {
  createCard,
  createSection,
  type CriterionCard,
  type CriterionItem,
  type CriterionSection,
} from './types'

export function CriteriaEditor({
  items,
  onChange,
}: {
  items: CriterionItem[]
  onChange: (items: CriterionItem[]) => void
}) {
  const updateCard = (cardId: string, patch: Partial<CriterionCard>) => {
    onChange(
      items.map((item) => {
        if (item.type === 'card') {
          return item.id === cardId ? { ...item, ...patch } : item
        }
        return {
          ...item,
          children: item.children.map((child) =>
            child.id === cardId ? { ...child, ...patch } : child,
          ),
        }
      }),
    )
  }

  const updateSection = (
    sectionId: string,
    patch: Partial<Pick<CriterionSection, 'title' | 'cap'>>,
  ) => {
    onChange(
      items.map((item) =>
        item.id === sectionId && item.type === 'section' ? { ...item, ...patch } : item,
      ),
    )
  }

  const removeItem = (itemId: string) => {
    onChange(items.filter((item) => item.id !== itemId))
  }

  const removeCard = (cardId: string) => {
    onChange(
      items.flatMap((item): CriterionItem[] => {
        if (item.type === 'card') return item.id === cardId ? [] : [item]
        return [{ ...item, children: item.children.filter((child) => child.id !== cardId) }]
      }),
    )
  }

  const addCardToSection = (sectionId: string) => {
    onChange(
      items.map((item) =>
        item.type === 'section' && item.id === sectionId
          ? { ...item, children: [...item.children, createCard()] }
          : item,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) =>
        item.type === 'card' ? (
          <CriterionCardEditor
            key={item.id}
            card={item}
            onChange={(patch) => updateCard(item.id, patch)}
            onRemove={() => removeCard(item.id)}
          />
        ) : (
          <CriterionSectionEditor
            key={item.id}
            section={item}
            onUpdate={(patch) => updateSection(item.id, patch)}
            onRemove={() => removeItem(item.id)}
            onCardChange={updateCard}
            onCardRemove={removeCard}
            onAddCard={() => addCardToSection(item.id)}
          />
        ),
      )}

      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line py-10 text-center text-xs text-fg-subtle">
          还没有评分项，点击下方「添加卡片」开始
        </div>
      )}

      <Dropdown>
        <Button variant="secondary" className="self-start">
          <Plus width={15} height={15} className="shrink-0" />
          添加卡片
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu
            onAction={(key) => {
              onChange([...items, key === 'section' ? createSection() : createCard()])
            }}
          >
            <Dropdown.Item id="card" textValue="添加卡片">
              <SquarePlus width={15} height={15} className="shrink-0 text-fg-muted" />
              <Label>添加卡片</Label>
            </Dropdown.Item>
            <Dropdown.Item id="section" textValue="添加小节块">
              <Rows3 width={15} height={15} className="shrink-0 text-fg-muted" />
              <Label>添加小节块</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  )
}

function CriterionCardEditor({
  card,
  onChange,
  onRemove,
}: {
  card: CriterionCard
  onChange: (patch: Partial<CriterionCard>) => void
  onRemove: () => void
}) {
  const isAdd = card.mode === 'add'

  return (
    <div className="rounded-xl border border-line bg-elevated p-3">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-line text-xs">
          <button
            type="button"
            onClick={() => onChange({ mode: 'add' })}
            className={cn(
              'px-2.5 py-1.5 transition-colors',
              isAdd
                ? 'bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            加分
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: 'subtract' })}
            className={cn(
              'border-l border-line px-2.5 py-1.5 transition-colors',
              !isAdd ? 'bg-danger/10 font-semibold text-danger' : 'text-fg-muted hover:text-fg',
            )}
          >
            减分
          </button>
        </div>
        <Input
          className="min-w-0 flex-1"
          placeholder="写在评语中的规则，例如：未画出流水线图"
          value={card.rule}
          onChange={(event) => onChange({ rule: event.target.value })}
          aria-label="评语规则"
        />
        <IconAction label="删除" onPress={onRemove}>
          <Trash2 width={15} height={15} className="shrink-0" />
        </IconAction>
      </div>

      <TextArea
        className="mt-2 w-full"
        rows={2}
        variant="secondary"
        placeholder="详细标准"
        value={card.detail}
        onChange={(event) => onChange({ detail: event.target.value })}
        aria-label="详细标准"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span>{isAdd ? '加分' : '扣分'}</span>
          <Input
            type="number"
            min={0}
            step="0.5"
            className="w-20"
            placeholder="分值"
            value={card.score}
            onChange={(event) => onChange({ score: event.target.value })}
            aria-label={isAdd ? '加分数目' : '扣分数目'}
          />
          <span className="text-fg-subtle">至</span>
          <Input
            type="number"
            min={0}
            step="0.5"
            className="w-20"
            placeholder="可选"
            value={card.scoreMax}
            onChange={(event) => onChange({ scoreMax: event.target.value })}
            aria-label="分数范围上限"
          />
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Checkbox
            aria-label="默认选中"
            isSelected={card.defaultSelected}
            onChange={(selected) => onChange({ defaultSelected: selected })}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox.Content>
          </Checkbox>
          <span className="text-xs text-fg-muted">默认选中</span>
        </div>
      </div>
    </div>
  )
}

function CriterionSectionEditor({
  section,
  onUpdate,
  onRemove,
  onCardChange,
  onCardRemove,
  onAddCard,
}: {
  section: CriterionSection
  onUpdate: (patch: Partial<Pick<CriterionSection, 'title' | 'cap' | 'init'>>) => void
  onRemove: () => void
  onCardChange: (cardId: string, patch: Partial<CriterionCard>) => void
  onCardRemove: (cardId: string) => void
  onAddCard: () => void
}) {
  return (
    <div className="rounded-2xl border border-line bg-sunken p-3">
      <div className="flex items-center gap-2">
        <Rows3
          width={15}
          height={15}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        <Input
          className="min-w-0 flex-1"
          placeholder="小节标题，例如：实验过程"
          value={section.title}
          onChange={(event) => onUpdate({ title: event.target.value })}
          aria-label="小节标题"
        />
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
          <span>初始分</span>
          <Input
            type="number"
            step="0.5"
            className="w-20"
            placeholder="0"
            value={section.init}
            onChange={(event) => onUpdate({ init: event.target.value })}
            aria-label="小节初始分"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
          <span>上限</span>
          <Input
            type="number"
            min={0}
            step="0.5"
            className="w-20"
            placeholder="不限"
            value={section.cap}
            onChange={(event) => onUpdate({ cap: event.target.value })}
            aria-label="小节分数上限"
          />
        </div>
        <IconAction label="删除小节" onPress={onRemove}>
          <Trash2 width={15} height={15} className="shrink-0" />
        </IconAction>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-s border-line ps-3">
        {section.children.map((card) => (
          <CriterionCardEditor
            key={card.id}
            card={card}
            onChange={(patch) => onCardChange(card.id, patch)}
            onRemove={() => onCardRemove(card.id)}
          />
        ))}
        <Button size="sm" variant="secondary" className="self-start" onPress={onAddCard}>
          <Plus width={14} height={14} className="shrink-0" />
          添加卡片
        </Button>
      </div>
    </div>
  )
}
