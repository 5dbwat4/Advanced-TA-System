import { Button, Dropdown, Label } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ChevronDown from '~icons/lucide/chevron-down'
import { fetchMyAccounts, switchMyAccount, type LoginCandidate, type Role } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useAppStore, useCurrentClass } from '@/lib/store'

const ROLE_LABELS: Record<Role, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
  STUDENT: '学生',
}

/** 右上角课程 / 账号切换下拉：同一学号下的多个课程账号可互相切换 */
export function ClassAccountMenu() {
  const { user, adoptSession } = useAuth()
  const navigate = useNavigate()
  const currentClass = useCurrentClass()
  const setCurrentClassId = useAppStore((state) => state.setCurrentClassId)
  const [accounts, setAccounts] = useState<LoginCandidate[]>([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMyAccounts()
      .then((res) => {
        if (!cancelled) setAccounts(res.accounts)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const accountOptions: LoginCandidate[] =
    accounts.length > 0
      ? accounts
      : user
        ? [
            {
              userId: user.id,
              name: user.name,
              studentId: user.studentId,
              classId: user.classId,
              className: currentClass?.name ?? null,
              role: user.role,
            },
          ]
        : []

  const switchCourse = async (account: LoginCandidate) => {
    if (account.userId === user?.id) {
      if (account.classId) setCurrentClassId(account.classId)
      return
    }

    setSwitching(true)
    try {
      const result = await switchMyAccount(account.userId)
      adoptSession(result)
      if (result.user.classId) setCurrentClassId(result.user.classId)
      if (result.user.role === 'STUDENT') {
        navigate('/home', { replace: true })
      } else {
        toast.success(`已切换到 ${account.className ?? '新课程'}`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '切换课程失败'))
    } finally {
      setSwitching(false)
    }
  }

  if (accountOptions.length === 0) {
    return (
      <Button aria-label="选择班级" size="sm" variant="secondary" isDisabled>
        未绑定班级
      </Button>
    )
  }

  return (
    <Dropdown>
      <Button
        aria-label="选择班级"
        size="sm"
        variant="secondary"
        isDisabled={switching}
        className="max-w-[10rem] md:max-w-[14rem]"
      >
        <span className="truncate">{currentClass?.name ?? '选择班级'}</span>
        <ChevronDown width={14} height={14} className="shrink-0 text-fg-subtle" />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          selectionMode="single"
          selectedKeys={user ? [user.id] : []}
          onSelectionChange={(keys) => {
            const id = Array.from(keys)[0]
            if (typeof id !== 'string') return
            const account = accountOptions.find((item) => item.userId === id)
            if (account) void switchCourse(account)
          }}
        >
          {accountOptions.map((item) => (
            <Dropdown.Item
              key={item.userId}
              id={item.userId}
              textValue={`${item.className ?? '未绑定班级'} ${ROLE_LABELS[item.role]}`}
            >
              <Dropdown.ItemIndicator />
              <Label className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{item.className ?? '未绑定班级'}</span>
                <span className="shrink-0 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
                  {ROLE_LABELS[item.role]}
                </span>
              </Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
