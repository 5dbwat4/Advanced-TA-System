import { useEffect, useState } from 'react'

import { apiFetch, type StudentOverview, type StudentOverviewExperiment } from '@/lib/api'

/** 浏览器通知轮询间隔：成绩变化最多延迟一分钟被发现 */
export const GRADE_NOTIFICATIONS_POLL_MS = 60_000

const ENABLED_PREFIX = 'tasaas.student.gradeNotifications.'
const BACKGROUND_PREFIX = 'tasaas.student.gradeNotifications.background.'
const SNAPSHOT_PREFIX = 'tasaas.student.gradeSnapshot.'
const CHANGE_EVENT = 'tasaas:grade-notifications-change'
const BACKGROUND_OWNER_KEY = 'tasaas.student.gradeNotifications.owner'
const PUSH_TAG = 'tasaas-grade-updates'

type SnapshotEntry = {
  total: number | null
  scores: string
}

type Snapshot = Record<string, SnapshotEntry>

type PushSubscriptionPayload = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export type BackgroundNotificationResult =
  | { ok: true }
  | { ok: false; message: string }

function enabledKey(userId: string): string {
  return `${ENABLED_PREFIX}${userId}`
}

function backgroundKey(userId: string): string {
  return `${BACKGROUND_PREFIX}${userId}`
}

function snapshotKey(userId: string): string {
  return `${SNAPSHOT_PREFIX}${userId}`
}

function emitChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** 当前浏览器是否支持系统通知 */
export function browserNotificationsSupported(): boolean {
  return supported()
}

/** 当前通知权限；浏览器不支持时返回 unsupported */
export function gradeNotificationsPermission(): NotificationPermission | 'unsupported' {
  if (!supported()) return 'unsupported'
  return Notification.permission
}

function enabled(userId: string | null | undefined): boolean {
  if (!userId || !supported() || Notification.permission !== 'granted') return false
  try {
    return localStorage.getItem(enabledKey(userId)) === '1'
  } catch {
    return false
  }
}

function backgroundEnabled(userId: string | null | undefined): boolean {
  if (!userId || !supported() || Notification.permission !== 'granted') return false
  try {
    return localStorage.getItem(backgroundKey(userId)) === '1'
  } catch {
    return false
  }
}

/** 读取本浏览器的成绩更新提醒开关（不进行任何服务端同步） */
export function getGradeNotifyEnabled(userId: string | null | undefined): boolean {
  return enabled(userId)
}

/** 读取本浏览器的后台成绩推送开关 */
export function getBackgroundGradeNotifyEnabled(userId: string | null | undefined): boolean {
  return backgroundEnabled(userId)
}

/** 当前占用后台提醒的账号；用于账号切换时清理旧账号的 Service Worker 状态 */
export function getBackgroundNotificationOwner(): string | null {
  try {
    const value = localStorage.getItem(BACKGROUND_OWNER_KEY)
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

/** 写入本浏览器的开关；关闭时同时清除成绩快照，避免下次开启时补发旧通知 */
export function setGradeNotifyEnabled(userId: string, next: boolean): void {
  try {
    if (next) {
      localStorage.setItem(enabledKey(userId), '1')
    } else {
      localStorage.removeItem(enabledKey(userId))
      localStorage.removeItem(snapshotKey(userId))
    }
  } catch {
    // localStorage 不可用时只在内存中生效
  }
  emitChange()
}

/** 监听本标签页和其他标签页对开关的修改 */
export function subscribeGradeNotify(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (
      event.key == null ||
      event.key.startsWith(ENABLED_PREFIX) ||
      event.key.startsWith(BACKGROUND_PREFIX) ||
      event.key.startsWith(SNAPSHOT_PREFIX)
    ) {
      listener()
    }
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** 订阅本浏览器开关状态的 React Hook */
export function useGradeNotifyEnabled(userId: string | null | undefined): boolean {
  const [value, setValue] = useState(() => enabled(userId))

  useEffect(() => {
    const sync = () => setValue(enabled(userId))
    sync()
    return subscribeGradeNotify(sync)
  }, [userId])

  return value
}

/** 订阅后台成绩推送开关的 React Hook */
export function useBackgroundGradeNotifyEnabled(userId: string | null | undefined): boolean {
  const [value, setValue] = useState(() => backgroundEnabled(userId))

  useEffect(() => {
    const sync = () => setValue(backgroundEnabled(userId))
    sync()
    return subscribeGradeNotify(sync)
  }, [userId])

  return value
}

function scoreSignature(experiment: StudentOverviewExperiment): string {
  return [...experiment.scores]
    .sort((left, right) => left.type - right.type)
    .map((score) => `${score.type}:${score.score}`)
    .join(',')
}

/** 读取某学生上次检查时的成绩快照 */
export function readGradeSnapshot(userId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(userId))
    if (!raw) return null
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const snapshot: Snapshot = {}
    for (const [experimentId, rawEntry] of Object.entries(value as Record<string, unknown>)) {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
      const total = (rawEntry as { total?: unknown }).total
      const scores = (rawEntry as { scores?: unknown }).scores
      if ((total === null || typeof total === 'number') && typeof scores === 'string') {
        snapshot[experimentId] = { total, scores }
      }
    }
    return snapshot
  } catch {
    return null
  }
}

/** 写入当前成绩快照 */
export function writeGradeSnapshot(userId: string, overview: StudentOverview): void {
  try {
    localStorage.setItem(snapshotKey(userId), JSON.stringify(toSnapshot(overview)))
  } catch {
    // localStorage 不可用时跳过持久化
  }
}

function toSnapshot(overview: StudentOverview): Snapshot {
  const snapshot: Snapshot = {}
  for (const experiment of overview.experiments) {
    snapshot[experiment.id] = {
      total: experiment.total,
      scores: scoreSignature(experiment),
    }
  }
  return snapshot
}

/** 对比两次快照，生成适合放进通知正文的中文描述 */
export function gradeUpdateMessages(previous: Snapshot, overview: StudentOverview): string[] {
  const messages: string[] = []
  for (const experiment of overview.experiments) {
    const before = previous[experiment.id]
    const scores = scoreSignature(experiment)
    if (!before) {
      if (experiment.total != null) {
        messages.push(`${experiment.mark} 已出分：${formatScore(experiment.total)}`)
      }
      continue
    }
    if (before.total === experiment.total && before.scores === scores) continue

    if (before.total == null && experiment.total != null) {
      messages.push(`${experiment.mark} 已出分：${formatScore(experiment.total)}`)
    } else if (before.total != null && experiment.total != null && before.total !== experiment.total) {
      messages.push(
        `${experiment.mark} 总评 ${formatScore(before.total)} → ${formatScore(experiment.total)}`,
      )
    } else if (before.total != null && experiment.total == null) {
      messages.push(`${experiment.mark} 成绩已撤回`)
    } else {
      messages.push(`${experiment.mark} 成绩已更新`)
    }
  }
  return messages
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  if (registration?.active) return registration
  return await new Promise<ServiceWorkerRegistration | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 3_000)
    navigator.serviceWorker.ready
      .then((ready) => {
        window.clearTimeout(timer)
        resolve(ready.active ? ready : null)
      })
      .catch(() => {
        window.clearTimeout(timer)
        resolve(null)
      })
  })
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }
  return output
}

function sameApplicationServerKey(
  subscription: PushSubscription,
  applicationServerKey: Uint8Array<ArrayBuffer>,
): boolean {
  const current = subscription.options.applicationServerKey
  if (!current) return true
  const bytes = new Uint8Array(current)
  if (bytes.length !== applicationServerKey.length) return false
  return bytes.every((value, index) => value === applicationServerKey[index])
}

function pushErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return '无法开启后台推送，请检查浏览器通知权限后重试'
}

async function readPushPublicKey(): Promise<Uint8Array<ArrayBuffer>> {
  const response = await apiFetch<{ publicKey: string }>('/api/push/public-key')
  return urlBase64ToUint8Array(response.publicKey)
}

async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  const endpoint = json.endpoint ?? subscription.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    throw new Error('浏览器返回的推送订阅不完整')
  }

  const payload: PushSubscriptionPayload = {
    endpoint,
    keys: { p256dh, auth },
  }
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

async function ensurePushSubscription(
  registration: ServiceWorkerRegistration,
  applicationServerKey: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription()
  if (existing && sameApplicationServerKey(existing, applicationServerKey)) {
    return existing
  }
  if (existing) await existing.unsubscribe()
  return await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })
}

/** 页面打开时刷新 Web Push 订阅，确保服务端仍持有当前浏览器的 endpoint */
export async function syncBackgroundGradeNotifications(userId: string): Promise<void> {
  if (!backgroundEnabled(userId)) return
  try {
    const registration = await getPushRegistration()
    if (!registration) return
    const applicationServerKey = await readPushPublicKey()
    const subscription = await ensurePushSubscription(registration, applicationServerKey)
    await savePushSubscription(subscription)
    localStorage.setItem(BACKGROUND_OWNER_KEY, userId)
  } catch {
    // 后台推送不可用时静默处理，不影响前台提醒
  }
}

/** 开启 Web Push：即使页面关闭，服务端也能向该浏览器推送成绩更新 */
export async function enableBackgroundGradeNotifications(
  userId: string,
): Promise<BackgroundNotificationResult> {
  if (!supported()) {
    return { ok: false, message: '当前浏览器不支持系统通知' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, message: '请先允许浏览器通知' }
  }

  let registration: ServiceWorkerRegistration | null
  try {
    registration = await getPushRegistration()
  } catch {
    registration = null
  }
  if (!registration) {
    return {
      ok: false,
      message: '浏览器尚未注册 Service Worker，请刷新页面后重试（开发环境不支持）',
    }
  }

  try {
    const applicationServerKey = await readPushPublicKey()
    const subscription = await ensurePushSubscription(registration, applicationServerKey)
    await savePushSubscription(subscription)
    localStorage.setItem(backgroundKey(userId), '1')
    localStorage.setItem(BACKGROUND_OWNER_KEY, userId)
    emitChange()
    return { ok: true }
  } catch (error) {
    return { ok: false, message: pushErrorMessage(error) }
  }
}

/** 关闭 Web Push：通知服务端删除 endpoint，并取消浏览器订阅 */
export async function disableBackgroundGradeNotifications(userId: string): Promise<void> {
  try {
    localStorage.removeItem(backgroundKey(userId))
    localStorage.removeItem(BACKGROUND_OWNER_KEY)
  } catch {
    // localStorage 不可用时忽略
  }
  emitChange()

  try {
    const registration = await getPushRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    await apiFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined)
    await subscription.unsubscribe().catch(() => undefined)
  } catch {
    // 清理失败不影响本地开关关闭
  }
}

/** 发送一条浏览器系统通知；不支持或未授权时静默失败 */
export async function showGradeNotification(title: string, body: string): Promise<boolean> {
  if (!supported() || Notification.permission !== 'granted') return false
  const options: NotificationOptions = {
    body,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}favicon-32x32.png`,
    tag: PUSH_TAG,
    data: { url: `${import.meta.env.BASE_URL}student-console/scores` },
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.active) {
        await registration.showNotification(title, options)
        return true
      }
    }
    const notification = new Notification(title, options)
    notification.onclick = () => {
      window.focus()
      window.location.assign(`${import.meta.env.BASE_URL}student-console/scores`)
      notification.close()
    }
    return true
  } catch {
    return false
  }
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}
