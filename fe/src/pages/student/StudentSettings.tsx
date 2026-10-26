import { Button, Input } from '@heroui/react'
import { useCallback, useState } from 'react'
import { useTimeoutFn } from 'react-use'
import { toast } from 'sonner'

import AtSign from '~icons/lucide/at-sign'
import Fingerprint from '~icons/lucide/fingerprint'
import IdCard from '~icons/lucide/id-card'
import Laptop from '~icons/lucide/laptop'
import Lock from '~icons/lucide/lock'
import Plus from '~icons/lucide/plus'
import Smartphone from '~icons/lucide/smartphone'
import Trash2 from '~icons/lucide/trash-2'
import { AvatarPicker } from '@/components/settings/AvatarPicker'
import { CacheSection } from '@/components/settings/CacheSection'
import { CreditsSection } from '@/components/settings/CreditsSection'
import { NotificationSection } from '@/components/settings/NotificationSection'
import { PreferenceSection } from '@/components/settings/PreferenceSection'
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
  { id: 'preferences', label: '偏好设置' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'cache', label: '缓存' },
  { id: 'credits', label: 'Credits' },
]

export default function StudentSettings() {
  const { user, updateSettings, refresh } = useAuth()
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [binding, setBinding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
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

  const passkeys = user?.passkeys ?? []

  const saveUsername = async () => {
    const next = username.trim()
    if (!next || next === user?.username) return
    setSavingName(true)
    try {
      await updateSettings({ action: 'set_username', username: next })
      toast.success('用户名已更新')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async () => {
    if (password.length < 8) return
    setSavingPassword(true)
    try {
      await updateSettings({ action: 'set_password', newPassword: password })
      setPassword('')
      toast.success('密码已更新')
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

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="设置" />
      <div className="flex items-start gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section id="profile" className={sectionClass('profile')}>
            <Card index={0} className="flex flex-col gap-5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <IdCard
                  width={16}
                  height={16}
                  className="shrink-0 text-brand-600 dark:text-brand-300"
                />
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
                  <div className="mt-1 truncate text-sm text-fg">{user?.name ?? '—'}</div>
                </div>
                <div className="rounded-xl border border-line bg-sunken px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                    角色
                  </div>
                  <div className="mt-1">
                    <span className="inline-flex items-center rounded-lg border border-line bg-elevated px-2 py-0.5 text-xs font-semibold text-fg-muted">
                      学生
                    </span>
                  </div>
                </div>
              </div>

              <AvatarPicker />

              <div className="rounded-xl border border-line p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <AtSign width={18} height={18} className="shrink-0" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-fg-muted">用户名</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    fullWidth
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={32}
                    autoComplete="username"
                  />
                  <PendingButton
                    variant="secondary"
                    isPending={savingName}
                    isDisabled={!username.trim() || username.trim() === user?.username}
                    onPress={saveUsername}
                  >
                    保存
                  </PendingButton>
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
                      {user?.hasPassword ? '已设置' : '未设置，可继续使用统一身份认证'}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    fullWidth
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="新密码（至少 8 位）"
                    autoComplete="new-password"
                  />
                  <PendingButton
                    variant="secondary"
                    isPending={savingPassword}
                    isDisabled={password.length < 8}
                    onPress={savePassword}
                  >
                    {user?.hasPassword ? '更新' : '设置'}
                  </PendingButton>
                </div>
              </div>

              <div className="rounded-xl border border-line p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Fingerprint width={18} height={18} className="shrink-0" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-fg-muted">通行密钥</div>
                    <div className="text-[11px] text-fg-subtle">
                      Touch ID · Face ID · Windows Hello
                    </div>
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
                        <Button
                          aria-label="解绑"
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          isDisabled={removingId !== null}
                          onPress={() => removePasskey(passkey.id)}
                        >
                          <Trash2 width={16} height={16} className="shrink-0" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </section>

          <section id="preferences" className={sectionClass('preferences')}>
            <PreferenceSection index={1} markdownOnly />
          </section>

          <section id="notifications" className={sectionClass('notifications')}>
            <NotificationSection index={2} />
          </section>

          <section id="cache" className={sectionClass('cache')}>
            <CacheSection index={3} />
          </section>

          <section id="credits" className={sectionClass('credits')}>
            <CreditsSection index={4} />
          </section>
        </div>

        <TableOfContents items={SECTIONS} />
      </div>
    </div>
  )
}
