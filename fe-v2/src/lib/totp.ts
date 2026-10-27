import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

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
  const remaining = ref(toValue(period))
  let offset = 0

  watch(
    () => [toValue(serverTime), toValue(secret)] as const,
    ([serverTimeValue]) => {
      if (serverTimeValue) offset = serverTimeValue - Date.now()
    },
    { immediate: true },
  )

  watch(
    () => [toValue(secret), toValue(period)] as const,
    ([secretValue, periodValue]) => {
      if (!secretValue) {
        code.value = null
        return
      }
      let cancelled = false
      let lastCounter = -1

      const tick = async () => {
        const now = Date.now() + offset
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
      const timer = setInterval(() => void tick(), 1000)
      return () => {
        cancelled = true
        clearInterval(timer)
      }
    },
    { immediate: true },
  )

  return { code, remaining, period: computed(() => toValue(period)) }
}
