/**
 * useToasts —— 把旧版 `sonner` 的调用形态包成 Nuxt UI 的 `useToast()`
 *
 * 背景（MIGRATION.md §2.4 / §4.3）：旧版有双 toast 系统
 *   - `sonner` 115 处调用 + 自定义玻璃拟态 `components/ui/Toaster.tsx`
 *   - HeroUI `Toast.Provider` 1 处（pages/Checkoff.tsx）
 * 统一到 Nuxt UI toast（玻璃拟态观感已在 app.config.ts 的 `ui.toast.slots.root` 调好，
 * 位置 bottom-right 已在 app/app.vue 的 `<UApp :toaster="{ position: 'bottom-right' }">` 配好）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、旧 sonner 调用 → 新封装 对照表
 * ────────────────────────────────────────────────────────────────────────
 * 旧（sonner）                     | 新（useToasts）           | color   | icon
 * ---------------------------------|---------------------------|---------|------------------------
 * toast('一键导入功能开发中')        | toast.info('…')            | info    | i-lucide-info
 * toast.success('已保存')           | toast.success('…')         | success | i-lucide-circle-check
 * toast.error(err.message)         | toast.error('…')           | error   | i-lucide-circle-alert
 * toast.warning('…')               | toast.warning('…')         | warning | i-lucide-triangle-alert
 * toast.loading('保存中…')          | toast.loading('…')         | neutral | i-lucide-loader-circle
 * toast.promise(fn, {              | toast.promise(fn, {       | 见下
 *   loading, success, error })     |   loading, success, error })
 * toast.dismiss(id) / toast.dismiss() | toast.dismiss(id) / toast.dismiss()
 *
 * 说明：
 *   - 旧版**实际只用到** `toast.success` / `toast.error` / 裸 `toast(msg)` 三种
 *     （grep 过 115 处调用，`toast.loading` / `toast.promise` / `toast.dismiss`
 *     一次都没用），所以 `warning` / `promise` / `dismiss` 属于补齐 API，Phase B
 *     全量替换时按需取用。
 *   - 裸 `toast(msg)` 映射到 `info`（中性提示，例如「同步功能开发中」）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、迁页面示例（Phase B 全量替换 115 处时照抄）
 * ────────────────────────────────────────────────────────────────────────
 * 1) 简单提示 —— 只改调用方名字：
 *
 *    // 旧
 *    import { toast } from 'sonner'
 *    toast.success('已保存')
 *    toast.error(error instanceof Error ? error.message : '保存失败')
 *    toast('一键导入功能开发中')
 *
 *    // 新
 *    const toast = useToasts()
 *    toast.success('已保存')
 *    toast.error(error instanceof Error ? error.message : '保存失败')
 *    toast.info('一键导入功能开发中')
 *
 * 2) 三个 loading 状态自己管（99% 的旧版调用都是这种，**不要**改成 promise）：
 *
 *    // 旧（照搬）
 *    const [saving, setSaving] = useState(false)
 *    try {
 *      setSaving(true)
 *      await save()
 *      toast.success('已保存')
 *    } catch (error) {
 *      toast.error('保存失败')
 *    } finally {
 *      setSaving(false)
 *    }
 *
 *    // 新（只有 useState → ref，toast 调用不变）
 *    const saving = ref(false)
 *    try {
 *      saving.value = true
 *      await save()
 *      toast.success('已保存')
 *    } catch (error) {
 *      toast.error('保存失败')
 *    } finally {
 *      saving.value = false
 *    }
 *
 * 3) 想用 promise 版（本项目暂无旧调用需要，可选）：
 *
 *    toast.promise(
 *      () => api.createExperiment(body),
 *      { loading: '创建中…', success: '已添加实验', error: (e) => (e instanceof Error ? e.message : '创建失败') },
 *    )
 *
 * 4) 需要手动关掉某条 toast（比如长任务）：
 *
 *    const id = toast.loading('正在导入名单…')
 *    // …
 *    toast.dismiss(id)
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、实现要点
 * ────────────────────────────────────────────────────────────────────────
 *   - `useToast()` 的方法只有 add / update / remove / clear / toasts，
 *     **没有 `dismiss`**：`dismiss(id?)` → `remove(id)` / `clear()`。
 *   - 底层 `toast` 原样挂出去（`result.ui`），需要 actions / description /
 *     duration 等高级能力时直接用它，不破坏封装。
 *   - 必须在 setup / composable 里调用（内部走 Nuxt 的 useState）。
 *   - 图标名已用 MCP `search-icons` 核实存在于 @iconify-json/lucide：
 *     i-lucide-circle-check / i-lucide-circle-alert / i-lucide-info /
 *     i-lucide-triangle-alert / i-lucide-loader-circle
 */
import { useToast } from '#imports'

/** 图标（已核实存在于 @iconify-json/lucide） */
const ICONS = {
  success: 'i-lucide-circle-check',
  error: 'i-lucide-circle-alert',
  warning: 'i-lucide-triangle-alert',
  info: 'i-lucide-info',
  loading: 'i-lucide-loader-circle',
} as const

export interface ToastPromiseOptions<T = unknown> {
  loading: string
  /** 可以是字符串，也可以是拿到结果后自己拼文案 */
  success: string | ((data: T) => string)
  error: string | ((error: unknown) => string)
  /** 成功/失败后的停留时间（毫秒），默认 4000 */
  duration?: number
}

function resolveMessage<T>(value: string | ((payload: T) => string), payload: T) {
  return typeof value === 'function' ? value(payload) : value
}

export function useToasts() {
  const ui = useToast()

  type ToastId = Parameters<typeof ui.remove>[0]

  function push(
    title: string,
    options: { color: 'success' | 'error' | 'warning' | 'info' | 'neutral', icon: string, duration?: number, close?: boolean },
  ): ToastId {
    return ui.add({
      title,
      color: options.color,
      icon: options.icon,
      ...(options.duration !== undefined && { duration: options.duration }),
      ...(options.close !== undefined && { close: options.close }),
    }).id
  }

  function success(title: string): ToastId {
    return push(title, { color: 'success', icon: ICONS.success })
  }

  function error(title: string): ToastId {
    return push(title, { color: 'error', icon: ICONS.error })
  }

  function warning(title: string): ToastId {
    return push(title, { color: 'warning', icon: ICONS.warning })
  }

  function info(title: string): ToastId {
    return push(title, { color: 'info', icon: ICONS.info })
  }

  /** 不会自动关闭，也没有关闭按钮（与 sonner 的 toast.loading 一致），需要手动 dismiss */
  function loading(title: string): ToastId {
    return push(title, { color: 'neutral', icon: ICONS.loading, duration: 0, close: false })
  }

  /**
   * 对应 `toast.promise(fn, { loading, success, error })`：
   * 先弹一条常驻的 loading，结束后原地 update 成成功/失败。
   * 与 sonner 一致：**失败时会把 error 重新抛出去**，调用方需要自己 catch。
   */
  async function promise<T>(
    fn: Promise<T> | (() => Promise<T>),
    options: ToastPromiseOptions<T>,
  ): Promise<T> {
    const task = typeof fn === 'function' ? fn() : fn
    const id = loading(options.loading)
    try {
      const data = await task
      ui.update(id, {
        title: resolveMessage(options.success, data),
        color: 'success',
        icon: ICONS.success,
        duration: options.duration ?? 4000,
        close: true,
      })
      return data
    } catch (err) {
      ui.update(id, {
        title: resolveMessage(options.error, err),
        color: 'error',
        icon: ICONS.error,
        duration: options.duration ?? 4000,
        close: true,
      })
      throw err
    }
  }

  /** dismiss() 全部；dismiss(id) 关掉指定的一条 */
  function dismiss(id?: ToastId) {
    if (id === undefined) ui.clear()
    else ui.remove(id)
  }

  return {
    success,
    error,
    warning,
    info,
    loading,
    promise,
    dismiss,
    /** 底层 useToast() 原样透出：需要 actions / description / onClick 等高级能力时用 */
    ui,
  }
}
