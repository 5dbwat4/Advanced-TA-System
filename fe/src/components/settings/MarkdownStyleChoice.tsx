import { Button, Modal, useOverlayState } from '@heroui/react'

import Check from '~icons/lucide/check'
import ChevronDown from '~icons/lucide/chevron-down'
import Github from '~icons/lucide/github'
import Pilcrow from '~icons/lucide/pilcrow'
import Settings2 from '~icons/lucide/settings-2'
import { PreferenceRow } from '@/components/settings/PreferenceRow'
import { Markdown } from '@/components/ui/Markdown'
import type { MarkdownStyleId } from '@/lib/api'
import { cn } from '@/lib/utils'

const OPTIONS: { id: MarkdownStyleId; title: string; desc: string }[] = [
  { id: 'github', title: 'github markdown', desc: '经典 GitHub 文档排版风格' },
  { id: 'prose', title: 'tailwind prose', desc: 'Tailwind Typography 阅读排版风格' },
]

const PREVIEW = [
  '## 标题示例',
  '',
  '这是一段正文，包含 **加粗**、*斜体* 与 `行内代码`。',
  '',
  '- 无序列表项一',
  '- 无序列表项二',
  '- 无序列表项三',
  '',
  '1. 有序列表项一',
  '2. 有序列表项二',
  '',
  '> 引用文本示例',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
  '| 列 A | 列 B |',
  '| --- | --- |',
  '| 1 | 2 |',
].join('\n')

function OptionLogo({ id }: { id: MarkdownStyleId }) {
  const Ico = id === 'github' ? Github : Pilcrow
  return <Ico width={18} height={18} className="shrink-0" />
}

export function MarkdownStyleChoice({
  value,
  onChange,
}: {
  value: MarkdownStyleId
  onChange: (value: MarkdownStyleId) => void
}) {
  const state = useOverlayState()
  const current = OPTIONS.find((option) => option.id === value) ?? OPTIONS[0]

  return (
    <>
      <PreferenceRow title="倾向使用的Markdown样式" hint={current.desc}>
        <Button size="sm" variant="secondary" onPress={state.open}>
          <OptionLogo id={current.id} />
          {current.title}
          <ChevronDown width={14} height={14} className="shrink-0" />
        </Button>
      </PreferenceRow>

      <Modal state={state}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-4xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Settings2 width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>选择 Markdown 样式</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <p className="text-xs text-fg-subtle">
                  该样式将应用于题目、答案等 Markdown 内容的展示，点击卡片即可选择。
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {OPTIONS.map((option) => {
                    const selected = option.id === value
                    return (
                      <div
                        key={option.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => {
                          onChange(option.id)
                          state.close()
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onChange(option.id)
                            state.close()
                          }
                        }}
                        className={cn(
                          'relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 p-4 text-left transition-all',
                          selected
                            ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/25'
                            : 'border-line hover:border-brand-500/40',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex',
                              selected ? 'text-brand-600 dark:text-brand-300' : 'text-fg-muted',
                            )}
                          >
                            <OptionLogo id={option.id} />
                          </span>
                          <span className="text-sm font-bold text-fg">{option.title}</span>
                        </div>
                        <p className="text-xs text-fg-subtle">{option.desc}</p>
                        <div className="h-72 overflow-y-auto overscroll-contain rounded-xl border border-line bg-sunken p-4">
                          <Markdown source={PREVIEW} style={option.id} />
                        </div>
                        {selected && (
                          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md">
                            <Check width={12} height={12} className="shrink-0" />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
