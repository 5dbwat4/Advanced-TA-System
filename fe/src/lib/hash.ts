import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * 让页面支持 URL hash 锚点。
 * SPA 客户端跳转不会像浏览器那样自动滚动到 #id，这里在路由 hash 变化后
 * 找到对应元素并平滑滚动过去（元素尚未渲染时会在若干帧内重试）。
 * 滚动成功时回调 onScroll(id)，可用于短暂高亮目标。
 */
export function useScrollToHash(onScroll?: (id: string) => void) {
  const { hash, pathname } = useLocation()

  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.replace(/^#/, ''))
    let attempts = 0
    let frame = 0

    const tryScroll = () => {
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        onScroll?.(id)
        return
      }
      if (attempts < 20) {
        attempts += 1
        frame = requestAnimationFrame(tryScroll)
      }
    }

    frame = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(frame)
  }, [hash, pathname, onScroll])
}
