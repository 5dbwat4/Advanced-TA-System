import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  fetchClassSettings,
  updateClassSettings,
  type ClassSettings,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

export type ClassSettingsPatchBody = Parameters<typeof updateClassSettings>[1]

export function useClassSettingsPatch(classId: string | null): {
  settings: ClassSettings | null
  settingsLoading: boolean
  patch: (
    body: ClassSettingsPatchBody,
    optimistic: (prev: ClassSettings | null) => ClassSettings | null,
  ) => Promise<boolean>
  saving: boolean
  rollbackFailed: boolean
  dismissRollbackFailure: () => void
} {
  const [settings, setSettings] = useState<ClassSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rollbackFailed, setRollbackFailed] = useState(false)

  useEffect(() => {
    if (!classId) {
      setSettings(null)
      return
    }
    let cancelled = false
    setSettingsLoading(true)
    fetchClassSettings(classId)
      .then((res) => {
        if (!cancelled) setSettings(res.settings)
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载课程设置失败'))
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  const patch = useCallback(
    async (
      body: ClassSettingsPatchBody,
      optimistic: (prev: ClassSettings | null) => ClassSettings | null,
    ): Promise<boolean> => {
      if (!classId) return false
      setSaving(true)
      setSettings((prev) => optimistic(prev))
      try {
        const { settings: updated } = await updateClassSettings(classId, body)
        setSettings(updated)
        return true
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        try {
          const { settings: fresh } = await fetchClassSettings(classId)
          setSettings(fresh)
        } catch {
          setRollbackFailed(true)
        }
        return false
      } finally {
        setSaving(false)
      }
    },
    [classId],
  )

  const dismissRollbackFailure = useCallback(() => setRollbackFailed(false), [])

  return { settings, settingsLoading, patch, saving, rollbackFailed, dismissRollbackFailure }
}

export function useDebouncedSave(save: () => Promise<void>, ms = 700): {
  schedule: () => void
  cancel: () => void
  saveFailed: boolean
  resetSaveFailure: () => void
} {
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const flush = useCallback(() => {
    if (!dirty.current) return
    dirty.current = false
    saveRef.current().catch(() => {
      setSaveFailed(true)
      dirty.current = true
    })
  }, [])

  const schedule = useCallback(() => {
    setSaveFailed(false)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, ms)
  }, [flush, ms])

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    dirty.current = false
  }, [])

  const resetSaveFailure = useCallback(() => setSaveFailed(false), [])

  return { schedule, cancel, saveFailed, resetSaveFailure }
}
