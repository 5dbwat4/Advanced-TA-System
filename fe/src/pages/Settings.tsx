import { Button, Input, Modal, useOverlayState } from '@heroui/react'
import { useCallback, useState } from 'react'
import { useTimeoutFn } from 'react-use'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import Fingerprint from '~icons/lucide/fingerprint'
import IdCard from '~icons/lucide/id-card'
import Laptop from '~icons/lucide/laptop'
import Lock from '~icons/lucide/lock'
import Pencil from '~icons/lucide/pencil'
import Plus from '~icons/lucide/plus'
import Smartphone from '~icons/lucide/smartphone'
import Trash2 from '~icons/lucide/trash-2'
import { PreferenceSection } from '@/components/settings/PreferenceSection'
import { SystemSection } from '@/components/settings/SystemSection'
import { ZjuamSection } from '@/components/settings/ZjuamSection'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { TableOfContents, type TocItem } from '@/components/ui/TableOfContents'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useScrollToHash } from '@/lib/hash'
import { registerPasskey } from '@/lib/passkey'
import { cn } from '@/lib/utils'

const SECTIONS: TocItem[] = [
  { id: 'profile', label: '个人信息' },
  { id: 'zjuam', label: '统一身份认证' },
  { id: 'preferences', label: '偏好设置' },
  { id: 'system', label: '系统设置' },
]

export default function Settings() {
  const { user, refresh, updateSettings } = useAuth()
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [, , resetHighlight] = useTimeoutFn(() => setHighlightId(null), 1600)

  useScrollToHash(
    useCallback(
      (id: string) => {
        setHighlightId(id)
        resetHighlight()
      },
      [resetHighlight],
    ),
  )

  const sectionClass = (id: string) =>
    cn(
      'scroll-mt-24 rounded-2xl transition-shadow duration-300',
      highlightId === id && 'ring-2 ring-brand-500/40 dark:ring-brand-400/50',
    )
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [binding, setBinding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  const nameState = useOverlayState()

  const hasPassword = user?.hasPassword ?? false
  const passkeys = user?.passkeys ?? []
  const roleLabel =
    user?.role === 'TEACHER' ? '教师' : user?.role === 'TA' ? '助教' : '学生'

  const savePassword = async () => {
    setSavingPassword(true)
    try {
      await updateSettings({ action: 'set_password', newPassword: password })
      toast.success(hasPassword ? '密码已更新' : '密码已设置')
      setPasswordOpen(false)
      setPassword('')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSavingPassword(false)
    }
  }

  const bindPasskey = async () => {
    setBinding(true)
    try {
      const ok = await registerPasskey()
      if (!ok) return
      await refresh()
      toast.success('已绑定通行密钥')
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定失败'))
    } finally {
      setBinding(false)
    }
  }

  const removePasskey = async (passkeyId: string) => {
    setRemovingId(passkeyId)
    try {
      await updateSettings({ action: 'remove_passkey', passkeyId })
      toast.success('已解绑')
    } catch (error) {
      toast.error(getErrorMessage(error, '解绑失败'))
    } finally {
      setRemovingId(null)
    }
  }

  const openNameEdit = () => {
    setNameDraft(user?.username ?? '')
    nameState.open()
  }

  const saveName = async () => {
    const next = nameDraft.trim()
    if (!next) return
    setSavingName(true)
    try {
      await updateSettings({ action: 'set_username', username: next })
      toast.success('用户名已更新')
      nameState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="设置" />
      <div className="flex items-start gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section id="profile" className={sectionClass('profile')}>
            <Card index={0} className="flex flex-col gap-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <IdCard width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            个人信息
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-sunken px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                学号
              </div>
              <div className="tabular mt-1 text-sm text-fg">{user?.studentId ?? '—'}</div>
            </div>
            <div className="rounded-xl border border-line bg-sunken px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                姓名
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="min-w-0 flex-1 truncate text-sm text-fg">{user?.username ?? '—'}</div>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label="修改用户名"
                  onPress={openNameEdit}
                >
                  <Pencil width={14} height={14} className="shrink-0" />
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-sunken px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                角色
              </div>
              <div className="mt-1">
                <span className="inline-flex items-center rounded-lg border border-line bg-elevated px-2 py-0.5 text-xs font-semibold text-fg-muted">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Lock width={18} height={18} className="shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-fg-muted">密码</div>
                <div className="text-[11px] text-fg-subtle">
                  {hasPassword ? '已设置' : '未设置'}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => setPasswordOpen((open) => !open)}
              >
                {hasPassword ? '更新密码' : '设置密码'}
              </Button>
            </div>

            {passwordOpen && (
              <div className="mt-3 flex flex-col gap-2">
                <Input
                  fullWidth
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                  minLength={8}
                  autoComplete="new-password"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setPasswordOpen(false)
                      setPassword('')
                    }}
                  >
                    取消
                  </Button>
                  <PendingButton
                    size="sm"
                    isDisabled={password.length < 8}
                    isPending={savingPassword}
                    onPress={savePassword}
                    icon={Check}
                  >
                    保存
                  </PendingButton>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Fingerprint width={18} height={18} className="shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-fg-muted">通行密钥</div>
                <div className="text-[11px] text-fg-subtle">Touch ID · Face ID · Windows Hello</div>
              </div>
              <PendingButton
                size="sm"
                variant="secondary"
                isPending={binding}
                onPress={bindPasskey}
                icon={Plus}
              >
                绑定本设备
              </PendingButton>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {passkeys.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-fg-subtle">
                  尚未绑定通行密钥
                </div>
              ) : (
                passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2.5"
                  >
                    {passkey.deviceType === 'multiDevice' ? (
                      <Smartphone width={16} height={16} className="shrink-0 text-fg-muted" />
                    ) : (
                      <Laptop width={16} height={16} className="shrink-0 text-fg-muted" />
                    )}
                    <div className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                      {passkey.createdAt
                        ? new Date(passkey.createdAt).toLocaleDateString()
                        : '已登记'}
                      {' · '}
                      {passkey.deviceType === 'multiDevice' ? '同步' : '本设备'}
                    </div>
                    <PendingButton
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label="解绑"
                      isPending={removingId === passkey.id}
                      onPress={() => removePasskey(passkey.id)}
                      icon={Trash2}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
            </Card>
          </section>

          <Modal state={nameState}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="sm:max-w-md">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Pencil width={18} height={18} className="shrink-0" />
                  </Modal.Icon>
                  <Modal.Heading>修改用户名</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                      用户名
                    </label>
                    <Input
                      fullWidth
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={32}
                      placeholder="1-32 个字符"
                      autoFocus
                    />
                    <p className="mt-1.5 text-[11px] text-fg-subtle">
                      用户名同时作为登录账号与显示姓名。
                    </p>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button slot="close" variant="secondary">
                    取消
                  </Button>
                  <PendingButton
                    isDisabled={!nameDraft.trim() || nameDraft.trim() === (user?.username ?? '')}
                    isPending={savingName}
                    onPress={saveName}
                    icon={Check}
                  >
                    保存
                  </PendingButton>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        <section id="zjuam" className={sectionClass('zjuam')}>
          <ZjuamSection index={1} />
        </section>

        <section id="preferences" className={sectionClass('preferences')}>
          <PreferenceSection index={2} />
        </section>

        <section id="system" className={sectionClass('system')}>
          <SystemSection index={3} />
        </section>
        </div>

        <TableOfContents items={SECTIONS} />
      </div>
    </div>
  )
}
