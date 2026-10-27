import { getCurrentScope, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { fetchClassSettings, updateClassSettings, type ClassSettings } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'

export type ClassSettingsPatchBody = Parameters<typeof updateClassSettings>[1]

export function useClassSettingsPatch(classId: MaybeRefOrGetter<string | null>) {
  const settings = ref<ClassSettings | null>(null)
  const settingsLoading = ref(false)
  const saving = ref(false)
  const rollbackFailed = ref(false)

  watch(
    () => toValue(classId),
    (id) => {
      if (!id) {
        settings.value = null
        return
      }
      let cancelled = false
      settingsLoading.value = true
      fetchClassSettings(id)
        .then((res) => {
          if (!cancelled) settings.value = res.settings
        })
        .catch((error: unknown) => {
          if (!cancelled) toast.error(getErrorMessage(error, '加载课程设置失败'))
        })
        .finally(() => {
          if (!cancelled) settingsLoading.value = false
        })
      return () => {
        cancelled = true
      }
    },
    { immediate: true },
  )

  async function patch(
    body: ClassSettingsPatchBody,
    optimistic: (prev: ClassSettings | null) => ClassSettings | null,
  ): Promise<boolean> {
    const id = toValue(classId)
    if (!id) return false
    saving.value = true
    settings.value = optimistic(settings.value)
    try {
      const { settings: updated } = await updateClassSettings(id, body)
      settings.value = updated
      return true
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
      try {
        const { settings: fresh } = await fetchClassSettings(id)
        settings.value = fresh
      } catch {
        rollbackFailed.value = true
      }
      return false
    } finally {
      saving.value = false
    }
  }

  function dismissRollbackFailure() {
    rollbackFailed.value = false
  }

  return { settings, settingsLoading, patch, saving, rollbackFailed, dismissRollbackFailure }
}

export function useDebouncedSave(save: () => Promise<void>, ms = 700) {
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const saveFailed = ref(false)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (timer) clearTimeout(timer)
    })
  }

  function flush() {
    if (!dirty) return
    dirty = false
    save().catch(() => {
      saveFailed.value = true
      dirty = true
    })
  }

  function schedule() {
    saveFailed.value = false
    dirty = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, ms)
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    dirty = false
  }

  function resetSaveFailure() {
    saveFailed.value = false
  }

  return { schedule, cancel, saveFailed, resetSaveFailure }
}
