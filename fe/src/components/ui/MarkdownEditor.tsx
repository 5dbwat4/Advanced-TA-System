import MDEditor from '@uiw/react-md-editor'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function MarkdownEditor({
  value,
  onChange,
  height = 240,
}: {
  value: string
  onChange: (value: string) => void
  height?: number
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const mode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div data-color-mode={mode}>
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? '')}
        height={height}
        preview="live"
      />
    </div>
  )
}
