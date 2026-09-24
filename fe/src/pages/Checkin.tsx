import { Button, InputOTP, REGEXP_ONLY_DIGITS } from '@heroui/react'
import { useState, type FormEvent } from 'react'

import Cpu from '~icons/lucide/cpu'
import LogIn from '~icons/lucide/log-in'
import { CheckinScreen } from '@/components/checkin/CheckinScreen'

export default function Checkin() {
  const [value, setValue] = useState('')
  const [code, setCode] = useState<string | null>(null)

  if (code) {
    return (
      <CheckinScreen
        code={code}
        onBack={() => {
          setCode(null)
          setValue('')
        }}
      />
    )
  }

  const valid = /^\d{6}$/.test(value)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    setCode(value)
  }

  return (
    <div className="diagonal-bg flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          <Cpu width={15} height={15} className="shrink-0" />
          CS-II Checkoff
        </div>
        <form
          onSubmit={submit}
          className="rounded-3xl border border-line bg-elevated/80 p-8 text-center shadow-2xl backdrop-blur-xl"
        >
          <div className="text-2xl font-bold tracking-tight text-fg">CS-II 验收</div>
          <div className="mt-1 text-sm text-fg-subtle">输入 6 位验收码加入</div>
          <div className="mt-6 flex justify-center">
            <InputOTP
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              value={value}
              onChange={setValue}
              autoFocus
              aria-label="验收码"
              className="justify-center"
            >
              <InputOTP.Group>
                <InputOTP.Slot index={0} />
                <InputOTP.Slot index={1} />
                <InputOTP.Slot index={2} />
              </InputOTP.Group>
              <InputOTP.Separator />
              <InputOTP.Group>
                <InputOTP.Slot index={3} />
                <InputOTP.Slot index={4} />
                <InputOTP.Slot index={5} />
              </InputOTP.Group>
            </InputOTP>
          </div>
          <Button type="submit" fullWidth isDisabled={!valid} className="mt-5">
            <LogIn width={16} height={16} className="shrink-0" />
            加入
          </Button>
        </form>
      </div>
    </div>
  )
}
