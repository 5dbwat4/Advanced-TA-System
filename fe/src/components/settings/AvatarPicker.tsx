import { Fragment, useState } from 'react'
import { Button, Modal, Separator, Tooltip, useOverlayState } from '@heroui/react'
import { toast } from 'sonner'
import { groups } from 'avatars'

import Check from '~icons/lucide/check'
import Image from '~icons/lucide/image'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

const AVATAR_SIZE = 48

/** 内置头像：小卡片展示当前头像，点「修改」弹出全部分组选择 */
export function AvatarPicker() {
  const { user, updateSettings } = useAuth()
  const [saving, setSaving] = useState(false)
  const state = useOverlayState()
  const current = user?.avatar ?? null
  const initial = user?.username?.slice(0, 1) ?? '·'

  const select = async (avatar: number | null) => {
    if (saving) return
    if (avatar !== current) {
      setSaving(true)
      try {
        await updateSettings({ action: 'set_avatar', avatar })
        toast.success(avatar === null ? '已恢复默认头像' : '头像已更新')
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        setSaving(false)
        return
      }
      setSaving(false)
    }
    state.close()
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-line p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-fg-muted">头像</div>
          <div className="mt-0.5 text-[11px] text-fg-subtle">当前头像</div>
        </div>
        <AvatarImage id={current} size={40} fallback={initial} />
        <Button size="sm" variant="secondary" onPress={() => state.open()}>
          修改
        </Button>
      </div>

      <Modal state={state}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Image width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>选择头像</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
                <section>
                  <div className="text-xs font-semibold text-fg-muted">默认</div>
                  <div className="mt-2 flex flex-wrap gap-2.5">
                    <AvatarOption
                      id={null}
                      name="默认（首字母）"
                      selected={current === null}
                      disabled={saving}
                      fallback={initial}
                      onSelect={() => void select(null)}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-fg-subtle">使用用户名首字母作为头像。</p>
                </section>

                {groups.map((group) => (
                  <Fragment key={group.name}>
                    <Separator />
                    <section>
                      <div className="text-xs font-semibold text-fg-muted">{group.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2.5">
                        {group.avatars.map((item) => (
                          <AvatarOption
                            key={item.id}
                            id={item.id}
                            name={item.name}
                            selected={current === item.id}
                            disabled={saving}
                            fallback={item.name.slice(0, 1)}
                            onSelect={() => void select(item.id)}
                          />
                        ))}
                      </div>
                      {group.description ? (
                        <p className="mt-2 text-[11px] text-fg-subtle">{group.description}</p>
                      ) : null}
                    </section>
                  </Fragment>
                ))}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  关闭
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}

function AvatarOption({
  id,
  name,
  selected,
  disabled,
  fallback,
  onSelect,
}: {
  id: number | null
  name: string
  selected: boolean
  disabled: boolean
  fallback: string
  onSelect: () => void
}) {
  return (
    <Tooltip delay={200}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label={name}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onSelect}
          className={cn(
            'relative rounded-full transition',
            selected
              ? 'ring-2 ring-brand-500 dark:ring-brand-400'
              : 'ring-1 ring-line hover:ring-brand-500/40',
          )}
        >
          <AvatarImage
            id={id}
            size={AVATAR_SIZE}
            fallback={fallback}
            className="pointer-events-none"
          />
          {selected ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white">
              <Check width={16} height={16} className="shrink-0" />
            </span>
          ) : null}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content>{name}</Tooltip.Content>
    </Tooltip>
  )
}
