import MDEditor from '@uiw/react-md-editor'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

export function Markdown({ source }: { source: string }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const mode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div data-color-mode={mode}>
      <MDEditor.Markdown source={source} remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} />
    </div>
  )
}
