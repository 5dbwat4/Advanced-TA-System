/**
 * totp —— 移植自 `fe/src/lib/totp.ts`（89 行）
 *
 * RFC 6238 动态口令推导（`totp`，与后端 SHA-1 实现一致）与 master 端配对码
 * （`useTotp`，本地按秒推导 + 服务端时间校准）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 迁移动作对照
 * ────────────────────────────────────────────────────────────────────────
 * 1) `base32Decode` / `totp`：**逐字一致**，包括 `Uint8Array<ArrayBuffer>` 泛型写法、
 *    8 字节大端 counter、动态截断与 `% 1_000_000` 取模，算法零改动。
 * 2) `useTotp` 由 React hook 改为 Vue composable，**返回值结构与旧版完全一致**：
 *    `{ code, remaining, period }`。旧版 `code` / `remaining` 来自 `useState`
 *    （→ 这里是 `Ref`，模板中自动解包、script 里需 `.value`），旧版 `period` 就是
 *    入参本身（→ 仍是普通数值，不是 ref）。
 * 3) 源文件的两个 `useEffect` 一一对应到两个 `watch`：
 *    ① 依赖 `[serverTime, secret]` → 写入时钟偏移 `offset`（对应 `offsetRef`）；
 *    ② 依赖 `[secret, period]` → 起 `setInterval(tick, 1000)`，依赖变化时
 *       先清理再重建，等价于 React 的「cleanup + 重新执行」。
 * 4) 清理时机有两处，都调同一个幂等的 `stop()`：`onWatcherCleanup`（依赖变化 /
 *    组件卸载时 watcher 停止）与 `onScopeDispose`（组件作用域销毁兜底），
 *    内部 `cancelled = true` + `clearInterval(timer)`，与源文件 cleanup 一致；
 *    异步 `totp()` 的结果也会被 `cancelled` 拦掉，不会写进已销毁的组件。
 * 5) 行为差异（仅签名放宽，逻辑不变）：入参类型由 `string | null` / `number`
 *    放宽为 `MaybeRefOrGetter`，以便调用方像 React 的依赖数组那样在值变化时重跑
 *    —— 本文件的直接调用方是 `MasterSlavePanel`，`session` 是异步到达的，请传
 *    getter（如 `() => props.session?.secret ?? null`），否则只会按初始值跑一次。
 *    另：返回的 `period` 是调用瞬间的快照（React 版拿到的是当次渲染的 prop）。
 */
import type { MaybeRefOrGetter } from 'vue'
import { onScopeDispose, onWatcherCleanup, ref, toValue, watch } from 'vue'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

/** RFC 6238：按时间步长推导 6 位动态口令（SHA-1，与后端一致） */
export async function totp(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret)
  const message = new Uint8Array(8)
  let value = counter
  for (let i = 7; i >= 0; i--) {
    message[i] = value & 0xff
    value = Math.floor(value / 256)
  }

  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message))
  const offset = signature[signature.length - 1] & 0x0f
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  return String(binary % 1_000_000).padStart(6, '0')
}

/** master 端：本地按秒推导配对码，并用服务端时间校准时钟偏移 */
export function useTotp(
  secret: MaybeRefOrGetter<string | null>,
  period: MaybeRefOrGetter<number>,
  serverTime: MaybeRefOrGetter<number | null>,
) {
  const code = ref<string | null>(null)
  const remaining = ref<number>(toValue(period))
  // 对应源文件的 offsetRef = useRef(0)
  const offset = ref(0)
  /** 当前这一轮的 setInterval 句柄，null 表示没在跑 */
  let timer: ReturnType<typeof setInterval> | null = null
  /** 对应源文件的 cancelled：为 true 时丢弃仍在路上的异步结果 */
  let cancelled = false

  /** 停掉本轮计时（对应 React effect 的 cleanup，幂等可重复调用） */
  function stop() {
    cancelled = true
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  // 组件销毁兜底：确保 setInterval 一定被清掉
  onScopeDispose(stop)

  // ① 时钟偏移（源文件第一个 useEffect，依赖 [serverTime, secret]）
  watch(
    [() => toValue(secret), () => toValue(serverTime)],
    ([, serverTimeValue]) => {
      if (serverTimeValue) offset.value = serverTimeValue - Date.now()
    },
  )

  // ② 计时（源文件第二个 useEffect，依赖 [secret, period]），依赖变化则清理后重建
  watch(
    [() => toValue(secret), () => toValue(period)],
    ([secretValue, periodValue]) => {
      if (!secretValue) {
        code.value = null
        return
      }
      cancelled = false
      let lastCounter = -1

      const tick = async () => {
        const now = Date.now() + offset.value
        const seconds = Math.floor(now / 1000)
        const counter = Math.floor(seconds / periodValue)
        if (!cancelled) remaining.value = periodValue - (seconds % periodValue)
        if (counter === lastCounter) return
        lastCounter = counter
        try {
          const value = await totp(secretValue, counter)
          if (!cancelled) code.value = value
        } catch {
          if (!cancelled) code.value = null
        }
      }

      void tick()
      timer = setInterval(() => void tick(), 1000)
      onWatcherCleanup(stop)
    },
    { immediate: true },
  )

  return { code, remaining, period: toValue(period) }
}
