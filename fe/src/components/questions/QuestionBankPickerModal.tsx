import { Button, Modal, Spinner, useOverlayState } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import Check from '~icons/lucide/check'
import NotebookText from '~icons/lucide/notebook-text'
import { Markdown } from '@/components/ui/Markdown'
import { PendingButton } from '@/components/ui/PendingButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { fetchBankQuestions, type QuestionBank } from '@/lib/api'
import { formatLocaleDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { cn } from '@/lib/utils'

type ModalState = ReturnType<typeof useOverlayState>

export function QuestionBankPickerModal({
  state,
  banks,
  selectedBankId,
  onSelect,
}: {
  state: ModalState
  banks: QuestionBank[]
  selectedBankId: string | null
  onSelect: (bankId: string) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (state.isOpen && !wasOpen.current) {
      setQuery('')
      setSelectedId(selectedBankId ?? banks[0]?.id ?? null)
    }
    wasOpen.current = state.isOpen
  }, [state.isOpen, selectedBankId, banks])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword ? banks.filter((bank) => bank.name.toLowerCase().includes(keyword)) : banks
  }, [banks, query])

  const selected = banks.find((bank) => bank.id === selectedId) ?? null
  const { data, error, loading } = useAsyncData(
    () => (selectedId ? fetchBankQuestions(selectedId) : Promise.resolve({ questions: [] })),
    [selectedId],
  )
  const questions = data?.questions ?? []

  const confirm = async () => {
    if (!selectedId) return
    setConfirming(true)
    try {
      await onSelect(selectedId)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-4xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <NotebookText width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>选择题目集</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <SearchInput
                value={query}
                onChange={setQuery}
                ariaLabel="搜索题目集"
                placeholder="搜索"
                autoFocus
              />
              <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
                <div className="max-h-[55vh] overflow-auto pe-1">
                  {filtered.length === 0 ? (
                    <p className="py-6 text-center text-xs text-fg-subtle">没有匹配的题目集</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {filtered.map((bank) => {
                        const active = selectedId === bank.id
                        return (
                          <button
                            key={bank.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedId(bank.id)}
                            className={cn(
                              'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                              active
                                ? 'border-brand-500/30 bg-brand-500/10'
                                : 'border-transparent hover:bg-sunken',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {bank.name}
                              </span>
                              <span className="shrink-0 text-[11px] text-fg-subtle">
                                {bank.owner.name}
                              </span>
                              {active && (
                                <Check
                                  width={15}
                                  height={15}
                                  className="shrink-0 text-brand-600 dark:text-brand-300"
                                />
                              )}
                            </div>
                            <div className="tabular mt-0.5 text-[11px] text-fg-subtle">
                              {bank.questions.length} 题 · 更新于{' '}
                              {formatLocaleDateTime(bank.updatedAt)}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex max-h-[55vh] min-h-64 flex-col overflow-hidden rounded-2xl border border-line bg-sunken">
                  {!selected ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-xs text-fg-subtle">
                      选择一个题目集查看内容
                    </div>
                  ) : (
                    <>
                      <div className="border-b border-line px-4 py-3">
                        <div className="truncate text-sm font-semibold">{selected.name}</div>
                        <div className="tabular mt-0.5 text-[11px] text-fg-subtle">
                          {selected.owner.name} · {selected.questions.length} 题 · 更新于{' '}
                          {formatLocaleDateTime(selected.updatedAt)}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto p-3">
                        {loading ? (
                          <div className="flex items-center justify-center py-10">
                            <Spinner />
                          </div>
                        ) : error ? (
                          <p className="py-10 text-center text-xs text-danger">{error}</p>
                        ) : questions.length === 0 ? (
                          <p className="py-10 text-center text-xs text-fg-subtle">
                            该题目集暂无题目
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {questions.map((item, index) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-line bg-elevated p-3"
                              >
                                <div className="mb-1.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                                  <span className="tabular">#{index + 1}</span>
                                  <span>{item.user.username ?? item.user.name}</span>
                                </div>
                                <Markdown source={item.question} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={state.close}>
                取消
              </Button>
              <PendingButton
                isPending={confirming}
                isDisabled={!selectedId}
                onPress={() => void confirm()}
              >
                绑定
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
