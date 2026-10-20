import { Button, Input, ListBox, NumberField, Select } from '@heroui/react'

import Plus from '~icons/lucide/plus'
import Trash2 from '~icons/lucide/trash-2'
import {
  BooleanSelect,
  Field,
  FlagSelect,
  NodeSelect,
} from '@/components/special-draw/SpecialDrawFields'
import { NODE_TYPE_LABEL } from '@/components/special-draw/special-draw-ui'
import { IconAction } from '@/components/ui/IconAction'
import type { QuestionBank } from '@/lib/api'
import {
  newSpecialDrawId,
  SPECIAL_DRAW_MAX_COUNT,
  type RatioBranch,
  type SpecialDrawNode,
} from '@/lib/special-draw'
import { cn } from '@/lib/utils'

export function SpecialDrawInspector({
  node,
  nodes,
  nodeIndex,
  banks,
  bankMap,
  onUpdate,
  onDelete,
}: {
  node: SpecialDrawNode
  nodes: SpecialDrawNode[]
  nodeIndex: Map<string, number>
  banks: QuestionBank[]
  bankMap: Map<string, QuestionBank>
  onUpdate: (updater: (node: SpecialDrawNode) => SpecialDrawNode) => void
  onDelete: () => void
}) {
  const update = (updater: (node: SpecialDrawNode) => SpecialDrawNode) => onUpdate(updater)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-fg">{NODE_TYPE_LABEL[node.type]}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconAction
            label="删除节点"
            isDisabled={node.type === 'start'}
            onPress={onDelete}
          >
            <Trash2 width={14} height={14} className="shrink-0" />
          </IconAction>
        </div>
      </div>

      {node.type === 'start' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-subtle">固定开始节点，不可删除。</p>
          <Field label="下一步">
            <NodeSelect
              label="开始后的下一步"
              value={node.next}
              onChange={(next) =>
                update((current) => (current.type === 'start' ? { ...current, next } : current))
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
        </div>
      )}

      {node.type === 'draw' && (
        <div className="flex flex-col gap-3">
          <Field label="题目集">
            <Select
              aria-label="抽题题目集"
              value={node.bankId}
              onChange={(key) => {
                if (key == null) return
                const bank = bankMap.get(String(key))
                if (!bank) return
                update((current) => {
                  if (current.type !== 'draw') return current
                  const maxCount = Math.max(1, bank.questions.length)
                  return {
                    ...current,
                    bankId: bank.id,
                    bankName: bank.name,
                    min: Math.min(current.min, maxCount),
                    max: Math.min(current.max, maxCount),
                  }
                })
              }}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {banks.map((bank) => (
                    <ListBox.Item key={bank.id} id={bank.id} textValue={bank.name}>
                      {bank.name}（{bank.questions.length} 题）
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <div className="mt-1 text-[11px] text-fg-subtle">
              {bankMap.get(node.bankId)?.questions.length ?? 0} 题可用
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="最少题数">
              <NumberField
                aria-label="最少抽取题数"
                variant="secondary"
                minValue={1}
                maxValue={Math.max(1, bankMap.get(node.bankId)?.questions.length ?? 1)}
                value={node.min}
                onChange={(next) => {
                  const min = next ?? 1
                  update((current) =>
                    current.type === 'draw'
                      ? { ...current, min, max: Math.max(min, current.max) }
                      : current,
                  )
                }}
              >
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input className="w-14 text-center tabular-nums" />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
            </Field>
            <Field label="最多题数">
              <NumberField
                aria-label="最多抽取题数"
                variant="secondary"
                minValue={node.min}
                maxValue={Math.max(
                  node.min,
                  bankMap.get(node.bankId)?.questions.length ?? node.min,
                )}
                value={node.max}
                onChange={(next) =>
                  update((current) =>
                    current.type === 'draw'
                      ? { ...current, max: Math.max(current.min, next ?? current.min) }
                      : current,
                  )
                }
              >
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input className="w-14 text-center tabular-nums" />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
            </Field>
          </div>

          <Field label="下一步">
            <NodeSelect
              label="抽题后的下一步"
              value={node.next}
              onChange={(next) =>
                update((current) => (current.type === 'draw' ? { ...current, next } : current))
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
        </div>
      )}

      {node.type === 'ratio' && (
        <div className="flex flex-col gap-2">
          {node.branches.map((branch) => {
            const total = node.branches.reduce((sum, item) => sum + item.weight, 0)
            const probability = total > 0 ? Math.round((branch.weight / total) * 100) : 0
            return (
              <div
                key={branch.id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border border-line bg-sunken p-2',
                )}
              >
                <div className="flex items-end gap-2">
                  <Field label="分支名称" className="min-w-0 flex-1">
                    <Input
                      aria-label="分支名称"
                      value={branch.label}
                      onChange={(event) =>
                        update((current) =>
                          current.type === 'ratio'
                            ? {
                                ...current,
                                branches: current.branches.map((item) =>
                                  item.id === branch.id
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </Field>
                  <Field label={`权重 · ${probability}%`}>
                    <NumberField
                      aria-label="分支权重"
                      variant="secondary"
                      minValue={0}
                      maxValue={100}
                      value={branch.weight}
                      onChange={(next) =>
                        update((current) =>
                          current.type === 'ratio'
                            ? {
                                ...current,
                                branches: current.branches.map((item) =>
                                  item.id === branch.id ? { ...item, weight: next ?? 0 } : item,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      <NumberField.Group>
                        <NumberField.DecrementButton />
                        <NumberField.Input className="w-12 text-center tabular-nums" />
                        <NumberField.IncrementButton />
                      </NumberField.Group>
                    </NumberField>
                  </Field>
                  <IconAction
                    label="删除分支"
                    isDisabled={node.branches.length <= 1}
                    onPress={() =>
                      update((current) =>
                        current.type === 'ratio' && current.branches.length > 1
                          ? {
                              ...current,
                              branches: current.branches.filter((item) => item.id !== branch.id),
                            }
                          : current,
                      )
                    }
                  >
                    <Trash2 width={14} height={14} className="shrink-0" />
                  </IconAction>
                </div>
                <Field label="下一步">
                  <NodeSelect
                    label="分支下一步"
                    value={branch.next}
                    onChange={(next) =>
                      update((current) =>
                        current.type === 'ratio'
                          ? {
                              ...current,
                              branches: current.branches.map((item) =>
                                item.id === branch.id ? { ...item, next } : item,
                              ),
                            }
                          : current,
                      )
                    }
                    nodes={nodes}
                    nodeIndex={nodeIndex}
                    excludeId={node.id}
                  />
                </Field>
              </div>
            )
          })}
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onPress={() =>
              update((current) =>
                current.type === 'ratio'
                  ? {
                      ...current,
                      branches: [
                        ...current.branches,
                        {
                          id: newSpecialDrawId('branch'),
                          label: `分支 ${current.branches.length + 1}`,
                          weight: 50,
                          next: null,
                        } satisfies RatioBranch,
                      ],
                    }
                  : current,
              )
            }
          >
            <Plus width={14} height={14} className="shrink-0" />
            添加分支
          </Button>
          <p className="text-[11px] text-fg-subtle">权重会按总和归一化为实际概率。</p>
        </div>
      )}

      {node.type === 'count' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="比较方式">
              <Select
                aria-label="比较方式"
                value={node.op}
                onChange={(key) => {
                  if (key === 'gt' || key === 'eq' || key === 'lt') {
                    update((current) =>
                      current.type === 'count' ? { ...current, op: key } : current,
                    )
                  }
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="gt" textValue="大于">
                      大于
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="eq" textValue="等于">
                      等于
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="lt" textValue="小于">
                      小于
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </Field>
            <Field label="比较值 Y">
              <NumberField
                aria-label="比较值"
                variant="secondary"
                minValue={0}
                maxValue={SPECIAL_DRAW_MAX_COUNT}
                value={node.value}
                onChange={(next) =>
                  update((current) =>
                    current.type === 'count'
                      ? { ...current, value: Math.max(0, next ?? 0) }
                      : current,
                  )
                }
              >
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input className="w-14 text-center tabular-nums" />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
            </Field>
          </div>
          <Field label="条件成立">
            <NodeSelect
              label="条件成立下一步"
              value={node.trueNext}
              onChange={(next) =>
                update((current) =>
                  current.type === 'count' ? { ...current, trueNext: next } : current,
                )
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
          <Field label="条件不成立">
            <NodeSelect
              label="条件不成立下一步"
              value={node.falseNext}
              onChange={(next) =>
                update((current) =>
                  current.type === 'count' ? { ...current, falseNext: next } : current,
                )
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
          <p className="text-[11px] text-fg-subtle">数量取最近一次抽题节点实际抽到的题数。</p>
        </div>
      )}

      {node.type === 'flag' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Flag">
              <FlagSelect
                label="条件 Flag"
                value={node.flag}
                onChange={(flag) =>
                  update((current) => (current.type === 'flag' ? { ...current, flag } : current))
                }
              />
            </Field>
            <Field label="期望值">
              <BooleanSelect
                label="Flag 期望值"
                value={node.value}
                trueLabel="为真"
                falseLabel="为假"
                onChange={(value) =>
                  update((current) => (current.type === 'flag' ? { ...current, value } : current))
                }
              />
            </Field>
          </div>
          <Field label="条件成立">
            <NodeSelect
              label="条件成立下一步"
              value={node.trueNext}
              onChange={(next) =>
                update((current) =>
                  current.type === 'flag' ? { ...current, trueNext: next } : current,
                )
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
          <Field label="条件不成立">
            <NodeSelect
              label="条件不成立下一步"
              value={node.falseNext}
              onChange={(next) =>
                update((current) =>
                  current.type === 'flag' ? { ...current, falseNext: next } : current,
                )
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
        </div>
      )}

      {node.type === 'setFlag' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Flag">
              <FlagSelect
                label="设置 Flag"
                value={node.flag}
                onChange={(flag) =>
                  update((current) =>
                    current.type === 'setFlag' ? { ...current, flag } : current,
                  )
                }
              />
            </Field>
            <Field label="设为">
              <BooleanSelect
                label="Flag 设置值"
                value={node.value}
                onChange={(value) =>
                  update((current) =>
                    current.type === 'setFlag' ? { ...current, value } : current,
                  )
                }
              />
            </Field>
          </div>
          <Field label="下一步">
            <NodeSelect
              label="设置 Flag 后的下一步"
              value={node.next}
              onChange={(next) =>
                update((current) =>
                  current.type === 'setFlag' ? { ...current, next } : current,
                )
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
        </div>
      )}

      {node.type === 'toggleFlag' && (
        <div className="flex flex-col gap-3">
          <Field label="Flag">
            <FlagSelect
              label="翻转 Flag"
              value={node.flag}
              onChange={(flag) =>
                update((current) =>
                  current.type === 'toggleFlag' ? { ...current, flag } : current,
                )
              }
            />
          </Field>
          <Field label="下一步">
            <NodeSelect
              label="翻转 Flag 后的下一步"
              value={node.next}
              onChange={(next) =>
                update((current) =>
                  current.type === 'toggleFlag' ? { ...current, next } : current,
                )
              }
              nodes={nodes}
              nodeIndex={nodeIndex}
              excludeId={node.id}
            />
          </Field>
        </div>
      )}

      {node.type === 'end' && <p className="text-xs text-fg-subtle">流程在这里结束。</p>}
    </div>
  )
}
