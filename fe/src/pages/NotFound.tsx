import { Spinner } from '@heroui/react'
import { useState } from 'react'

import { Minecraft404 } from 'minecraft-404-page'

/** 404 页：常规内容排版 + 嵌入式体素场景（背景透明，融入页面底色）。 */
export default function NotFound() {
  const [ready, setReady] = useState(false)

  return (
    <div className="mx-auto w-full md:max-w-[50vw]">
      <header className="border-l-4 border-brand-500 pl-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">404 Not Found</h1>
      </header>

      <div className="relative mt-6 aspect-video w-full select-none">
        <Minecraft404 className="h-full w-full" onReady={() => setReady(true)} />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  )
}
