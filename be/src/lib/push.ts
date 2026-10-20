import webpush from 'web-push'

import { env } from '../env.js'
import { prisma } from './prisma.js'

const SCORE_TYPE_LABELS = ['功能测试', '验收问答', '报告']
const DEFAULT_TAG = 'tasaas-grade-updates'

/** VAPID 未配置时整个 Web Push 功能静默禁用 */
export const pushConfigured = Boolean(env.vapidPublicKey && env.vapidPrivateKey)

if (pushConfigured) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey)
}

export type GradePushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

export function scoreTypeLabel(type: number): string {
  return SCORE_TYPE_LABELS[type] ?? '附加分'
}

export function describeScoreChange({
  type,
  previous,
  next,
  experimentMark,
  indId,
}: {
  type: number
  previous: number | null
  next: number | null
  experimentMark?: string | null
  indId: string
}): string {
  const label = type === 3 ? indId : scoreTypeLabel(type)
  const prefix = type === 3 ? '' : `${experimentMark ?? ''} `.trimStart()
  if (next === null) return `${prefix}${label} 成绩已撤回`
  if (previous === null) return `${prefix}${label} 已出分：${formatScore(next)}`
  return `${prefix}${label} ${formatScore(previous)} → ${formatScore(next)}`
}

/** 向某个学生的所有浏览器订阅发送 Web Push；失败不抛错，404/410 自动清理订阅 */
export async function sendPushToUser(userId: string, payload: GradePushPayload): Promise<void> {
  if (!pushConfigured) return

  const subscriptions = await prisma.pushSubscription
    .findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    .catch(() => [])
  if (subscriptions.length === 0) return

  const body = JSON.stringify({
    tag: DEFAULT_TAG,
    ...payload,
  })

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60 },
        )
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: subscription.id } })
            .catch(() => undefined)
          return
        }
        console.warn(`Web Push failed for subscription ${subscription.id}: ${statusCode ?? 'unknown'}`)
      }
    }),
  )
}
