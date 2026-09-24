import { languages } from '@codemirror/language-data'
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  HighlightToggle,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  StrikeThroughSupSubToggles,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  searchPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type MDXEditorMethods,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import MDEditor from '@uiw/react-md-editor'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (value: string) => void
  height?: number
}

function UiwMarkdownEditor({ value, onChange, height = 240 }: Props) {
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

function FullToolbar() {
  return (
    <>
      <UndoRedo />
      <Separator />
      <BoldItalicUnderlineToggles />
      <CodeToggle />
      <HighlightToggle />
      <Separator />
      <StrikeThroughSupSubToggles />
      <Separator />
      <ListsToggle />
      <Separator />
      <BlockTypeSelect />
      <Separator />
      <CreateLink />
      <InsertTable />
      <InsertThematicBreak />
      <Separator />
      <InsertCodeBlock />
      <ConditionalContents
        options={[
          {
            when: (editor) => editor?.editorType === 'codeblock',
            contents: () => <ChangeCodeMirrorLanguage />,
          },
        ]}
      />
    </>
  )
}

function MdxMarkdownEditor({ value, onChange, height = 240 }: Props) {
  const { resolvedTheme } = useTheme()
  const editorRef = useRef<MDXEditorMethods>(null)
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      editorRef.current?.setMarkdown(value)
    }
  }, [value])

  return (
    <div
      className={cn(
        '[&_.mdxeditor-root-contenteditable]:min-h-[var(--mdx-min-height)]',
        resolvedTheme === 'dark' && 'dark-theme dark-editor',
      )}
      style={{ '--mdx-min-height': `${height}px` } as CSSProperties}
    >
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={(next) => {
          lastEmitted.current = next
          onChange(next)
        }}
        className="overflow-hidden rounded-xl border border-line bg-elevated"
        contentEditableClassName="mdx-editor-content px-3 py-2 outline-none"
        placeholder="在此输入 Markdown…"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          codeBlockPlugin(),
          codeMirrorPlugin({ codeBlockLanguages: languages }),
          markdownShortcutPlugin(),
          searchPlugin(),
          toolbarPlugin({ toolbarContents: () => <FullToolbar /> }),
        ]}
      />
    </div>
  )
}

export function MarkdownEditor({ value, onChange, height = 240 }: Props) {
  const { user } = useAuth()
  const editor = user?.preferences?.markdownEditor ?? 'uiw'

  return editor === 'mdx' ? (
    <MdxMarkdownEditor value={value} onChange={onChange} height={height} />
  ) : (
    <UiwMarkdownEditor value={value} onChange={onChange} height={height} />
  )
}
