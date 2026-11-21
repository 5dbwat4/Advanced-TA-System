import { lazy, Suspense } from 'react'

export type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  height?: number
}

const MarkdownEditorImpl = lazy(() =>
  import('./MarkdownEditorImpl').then((module) => ({ default: module.MarkdownEditorImpl })),
)

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="animate-pulse rounded-xl border border-line bg-sunken"
          style={{ height: props.height ?? 240 }}
        />
      }
    >
      <MarkdownEditorImpl {...props} />
    </Suspense>
  )
}
