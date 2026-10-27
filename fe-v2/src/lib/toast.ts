import { useToast } from '@nuxt/ui/composables'

type ToastApi = ReturnType<typeof useToast>

let api: ToastApi | null = null

export function installToast() {
  api = useToast()
}

type ToastOptions = {
  description?: string
  duration?: number
  id?: string | number
  icon?: string
}

function add(title: string, color: 'success' | 'error' | 'warning' | 'info' | 'neutral', options: ToastOptions = {}) {
  return api?.add({
    title,
    description: options.description,
    color,
    duration: options.duration,
    id: options.id,
    icon: options.icon,
  })
}

export const toast = {
  success(title: string, description?: string, options: ToastOptions = {}) {
    return add(title, 'success', { description, ...options, icon: options.icon ?? 'i-lucide-circle-check' })
  },
  error(title: string, description?: string, options: ToastOptions = {}) {
    return add(title, 'error', { description, ...options, icon: options.icon ?? 'i-lucide-circle-alert' })
  },
  warning(title: string, description?: string, options: ToastOptions = {}) {
    return add(title, 'warning', { description, ...options, icon: options.icon ?? 'i-lucide-triangle-alert' })
  },
  info(title: string, description?: string, options: ToastOptions = {}) {
    return add(title, 'info', { description, ...options, icon: options.icon ?? 'i-lucide-info' })
  },
  show(title: string, description?: string, options: ToastOptions = {}) {
    return add(title, 'neutral', { description, ...options })
  },
  add: (options: Parameters<ToastApi['add']>[0]) => api?.add(options),
  update: (id: string | number, options: Parameters<ToastApi['update']>[1]) => api?.update(id, options),
  remove: (id: string | number) => api?.remove(id),
  close: (id: string | number) => api?.remove(id),
  clear: () => api?.clear(),
}

export function useAppToast() {
  if (!api) installToast()
  return toast
}
