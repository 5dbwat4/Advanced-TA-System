import { Button } from '@heroui/react'
import { Component, Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { reportRouteError } from '@/lib/sentry'

type BoundaryProps = { children: ReactNode; route: string }
type BoundaryState = { error: Error | null }

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    reportRouteError(error, this.props.route)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center rounded-2xl border border-line bg-elevated p-8">
          <div className="max-w-md text-center">
            <h2 className="text-lg font-semibold">此页面暂时无法加载</h2>
            <p className="mt-2 text-sm text-fg-muted">
              可能是网络超时或资源版本变化。重试只刷新当前标签页，不会影响其他页面。
            </p>
            <Button className="mt-5" onPress={() => window.location.reload()}>
              刷新当前页重试
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RouteLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="正在加载页面">
      <div className="h-8 w-48 rounded-lg bg-sunken" />
      <div className="h-32 rounded-2xl border border-line bg-sunken" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-2xl border border-line bg-sunken" />
        <div className="h-40 rounded-2xl border border-line bg-sunken" />
      </div>
    </div>
  )
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <Boundary key={pathname} route={pathname}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </Boundary>
  )
}
