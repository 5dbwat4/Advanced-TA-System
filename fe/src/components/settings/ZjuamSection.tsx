import { Button, Input, Spinner, Tooltip } from '@heroui/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import CloudUpload from '~icons/lucide/cloud-upload'
import HardDrive from '~icons/lucide/hard-drive'
import Lock from '~icons/lucide/lock'
import School from '~icons/lucide/school'
import Trash2 from '~icons/lucide/trash-2'
import { Card } from '@/components/ui/Card'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAppStore } from '@/lib/store'
import { getZjuamCredential, setZjuamCredential } from '@/lib/zjuam'

export function ZjuamSection({ index = 0 }: { index?: number }) {
  const { user, refresh } = useAuth()
  const [local, setLocal] = useState(() => getZjuamCredential())
  const [editing, setEditing] = useState(false)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const openForm = () => {
    setAccount(local?.account ?? user?.zjuamAccount ?? '')
    setPassword(local?.password ?? '')
    setEditing(true)
  }

  const toggleForm = () => {
    if (editing) setEditing(false)
    else openForm()
  }

  const closeForm = () => {
    setEditing(false)
    setPassword('')
  }

  const saveLocal = () => {
    setZjuamCredential({ account, password })
    setLocal({ account, password })
    useAppStore.getState().syncLocalCredential()
    void useAppStore.getState().loadZjuamCourses({ force: true })
    toast.success('已保存在本地')
    closeForm()
  }

  const saveRemote = async () => {
    setSaving(true)
    try {
      setZjuamCredential({ account, password })
      setLocal({ account, password })
      await apiFetch('/api/auth/zjuam/credentials', {
        method: 'PUT',
        body: JSON.stringify({ account, password }),
      })
      await refresh()
      useAppStore.getState().syncLocalCredential()
      void useAppStore.getState().loadZjuamCourses({ force: true })
      toast.success('已保存在远端')
      closeForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteRemote = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/auth/zjuam/credentials', { method: 'DELETE' })
      await refresh()
      useAppStore.getState().syncLocalCredential()
      if (getZjuamCredential()) {
        void useAppStore.getState().loadZjuamCourses({ force: true })
      } else {
        useAppStore.getState().resetZjuam()
      }
      toast.success('已从远端删除')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const uploadLocal = async () => {
    if (!local) {
      toast.error('请先输入密码')
      openForm()
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/auth/zjuam/credentials', {
        method: 'PUT',
        body: JSON.stringify({ account: local.account, password: local.password }),
      })
      await refresh()
      toast.success('已保存在远端')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <School width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
        浙大统一身份认证信息管理
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <Lock width={18} height={18} className="shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-fg-muted">密码：</div>
            <div className="text-[11px] text-fg-subtle">
              {local?.password || user?.hasZjuamPassword ? '••••••' : '(none)'}
            </div>
          </div>
          <Tooltip delay={0}>
            <Button variant="secondary" size="sm" onPress={toggleForm}>
              修改密码
            </Button>
            <Tooltip.Content>
              <p>修改您保存在本地或 tasaas 远端的密码。不会影响浙大统一身份认证服务的密码。</p>
            </Tooltip.Content>
          </Tooltip>
        </div>

        {editing && (
          <div className="mt-3 flex flex-col gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">浙大账号</label>
              <Input
                fullWidth
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                maxLength={64}
                autoComplete="off"
                aria-label="浙大账号"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
              <Input
                fullWidth
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                autoComplete="off"
                aria-label="密码"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onPress={closeForm}>
                取消
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={!account.trim() || !password}
                isPending={saving}
                onPress={saveLocal}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <HardDrive width={16} height={16} className="shrink-0" />
                    )}
                    仅保存在本地
                  </>
                )}
              </Button>
              <Button
                size="sm"
                isDisabled={!account.trim() || !password}
                isPending={saving}
                onPress={saveRemote}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <CloudUpload width={16} height={16} className="shrink-0" />
                    )}
                    保存在远端
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-fg-muted">远端保存</div>
          <div className="mt-1">
            {user?.hasZjuamPassword ? (
              <span className="rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
                已保存在远端
              </span>
            ) : (
              <span className="rounded-lg bg-elevated px-2.5 py-1 text-xs font-semibold text-fg-subtle">
                未保存在远端
              </span>
            )}
          </div>
        </div>
        {user?.hasZjuamPassword ? (
          <Button size="sm" variant="secondary" isPending={saving} onPress={deleteRemote}>
            {({ isPending }) => (
              <>
                {isPending ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <Trash2 width={16} height={16} className="shrink-0" />
                )}
                从远端删除
              </>
            )}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" isPending={saving} onPress={uploadLocal}>
            {({ isPending }) => (
              <>
                {isPending ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <CloudUpload width={16} height={16} className="shrink-0" />
                )}
                保存到远端
              </>
            )}
          </Button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-fg-subtle">
        我们非常重视您的个人信息安全。除非必要，我们不会收集您的浙大统一身份认证密码。如果您不提供密码，将无法使用我们的部分服务，包括获取和向学在浙大同步实验分数等，但不会影响平台本身功能的使用。选择“密码保存在本地”意味着每次使用学在浙大功能时都会将您的密码发送至远端重新登录；选择“密码保存在远端”则意味着您同意将密码信息于服务器上持久保存。{' '}
        详见{' '}
        <Link
          to="/terms"
          className="font-semibold text-brand-600 underline decoration-brand-500/40 underline-offset-2 dark:text-brand-300"
        >
          Privacy &amp; Terms
        </Link>
      </p>
    </Card>
  )
}
