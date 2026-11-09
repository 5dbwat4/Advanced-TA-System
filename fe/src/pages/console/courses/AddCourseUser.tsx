import { Button, Input, ListBox, Select } from '@heroui/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import Check from '~icons/lucide/check'
import Copy from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import UserPlus from '~icons/lucide/user-plus'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { addClassUser, createInviteLink, type InvitableRole, type Ta } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'

const ROLE_OPTIONS: { value: InvitableRole; label: string }[] = [
  { value: 'TA', label: '助教' },
  { value: 'TEACHER', label: '教师' },
  { value: 'VIEWER', label: '观察者' },
]

const ROLE_LABELS = Object.fromEntries(
  ROLE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<InvitableRole, string>

function RoleSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: InvitableRole
  onChange: (role: InvitableRole) => void
  ariaLabel: string
}) {
  return (
    <Select
      fullWidth
      aria-label={ariaLabel}
      value={value}
      onChange={(key) => onChange(String(key) as InvitableRole)}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {ROLE_OPTIONS.map((item) => (
            <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export default function AddCourseUser() {
  const navigate = useNavigate()
  const currentClass = useCurrentClass()

  const [idRole, setIdRole] = useState<InvitableRole>('TA')
  const [studentId, setStudentId] = useState('')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<{ user: Ta; password: string } | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)

  const [inviteRole, setInviteRole] = useState<InvitableRole>('TA')
  const [inviting, setInviting] = useState(false)
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const submitById = async () => {
    const id = studentId.trim()
    if (!id || adding) return
    setAdding(true)
    try {
      const result = await addClassUser(id, idRole)
      setAdded(result)
      setStudentId('')
      toast.success('已添加用户')
    } catch (error) {
      toast.error(getErrorMessage(error, '添加失败'))
    } finally {
      setAdding(false)
    }
  }

  const copyPassword = async () => {
    if (!added) return
    try {
      await navigator.clipboard.writeText(added.password)
      setPasswordCopied(true)
      toast.success('密码已复制')
      window.setTimeout(() => setPasswordCopied(false), 1500)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const generateInvite = async () => {
    if (inviting) return
    setInviting(true)
    try {
      const result = await createInviteLink(inviteRole)
      const url = `${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`
      setInvite({ url, expiresAt: result.expiresAt })
      toast.success('邀请链接已生成')
    } catch (error) {
      toast.error(getErrorMessage(error, '生成邀请链接失败'))
    } finally {
      setInviting(false)
    }
  }

  const copyLink = async () => {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite.url)
      setLinkCopied(true)
      toast.success('链接已复制')
      window.setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="为本课程添加用户"
        subtitle={currentClass ? undefined : '请先选择课程'}
        actions={
          <Button variant="ghost" size="sm" onPress={() => navigate(-1)}>
            <ArrowLeft width={16} height={16} className="shrink-0" />
            返回
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card index={0} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <UserPlus width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            <span className="text-sm font-bold">使用学工号或用户名注册</span>
          </div>
          <p className="text-xs leading-relaxed text-fg-subtle">
            在当前班级创建【学工号 / 用户名 + 班级】账号，并生成一次性初始密码。
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">用户类型</label>
              <RoleSelect value={idRole} onChange={setIdRole} ariaLabel="选择用户类型" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">学工号 / 用户名</label>
              <Input
                fullWidth
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitById()
                }}
                placeholder="请输入学工号或用户名"
                autoComplete="off"
                maxLength={32}
                aria-label="学工号或用户名"
              />
            </div>
            <PendingButton
              isDisabled={!studentId.trim()}
              isPending={adding}
              onPress={() => void submitById()}
            >
              添加用户
            </PendingButton>
          </div>

          {added && (
            <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                已添加
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                <span className="tabular">{added.user.studentId}</span>
                <span className="rounded-lg bg-elevated px-2 py-0.5 text-xs text-fg-muted">
                  {ROLE_LABELS[added.user.role as InvitableRole]}
                </span>
                <span className="text-xs font-normal text-fg-subtle">
                  {added.user.classes[0]?.name ?? currentClass?.name ?? '当前班级'}
                </span>
              </div>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                初始密码
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs">
                  {added.password}
                </code>
                <PendingButton
                  size="sm"
                  variant="secondary"
                  icon={passwordCopied ? Check : Copy}
                  onPress={() => void copyPassword()}
                >
                  {passwordCopied ? '已复制' : '复制'}
                </PendingButton>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-danger">
                密码仅在本次显示，请立即复制并发送给对方。首次登录后需设置用户名，并可绑定密码 /
                WebAuthn。
              </p>
            </div>
          )}
        </Card>

        <Card index={1} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <LinkIcon width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            <span className="text-sm font-bold">使用邀请链接</span>
          </div>
          <p className="text-xs leading-relaxed text-fg-subtle">
            生成邀请链接，对方登录后可在本课程获得所选身份。链接 7 天内有效。
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">用户类型</label>
              <RoleSelect value={inviteRole} onChange={setInviteRole} ariaLabel="选择邀请的用户类型" />
            </div>
            <PendingButton isPending={inviting} onPress={() => void generateInvite()}>
              生成邀请链接
            </PendingButton>
          </div>

          {invite && (
            <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                邀请链接
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  fullWidth
                  readOnly
                  value={invite.url}
                  className="font-mono text-xs"
                  aria-label="邀请链接"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <PendingButton
                  size="sm"
                  variant="secondary"
                  icon={linkCopied ? Check : Copy}
                  onPress={() => void copyLink()}
                >
                  {linkCopied ? '已复制' : '复制'}
                </PendingButton>
              </div>
              <p className="mt-3 text-xs text-fg-subtle">
                有效期至 {new Date(invite.expiresAt).toLocaleString()}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
