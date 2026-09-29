import { Button, Modal, useOverlayState } from '@heroui/react'
import type { ReactNode, SVGProps } from 'react'

import Check from '~icons/lucide/check'
import ChevronDown from '~icons/lucide/chevron-down'
import Settings2 from '~icons/lucide/settings-2'
import { PreferenceRow } from '@/components/settings/PreferenceRow'
import type { MarkdownEditorId } from '@/lib/api'
import { cn } from '@/lib/utils'

function UiwLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M5.70480219,0 L10.4096044,3.41834667 L8.61252986,8.94934776 L2.79707453,8.94934776 L1,3.41834667 L5.70480219,0 Z M5.70480219,20 L1,16.5816533 L2.79707453,11.0506522 L8.61252986,11.0506522 L10.4096044,16.5816533 L5.70480219,20 Z M18.8709653,12.9678909 L13.3400514,14.7649021 L9.92167142,10.0599974 L13.3399103,5.35519519 L18.8708781,7.15237223 L18.8709653,12.9678909 Z" />
    </svg>
  )
}

function MdxEditorLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 239 39" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M87.224 38V2.96h21.024v5.28h-15.12v9.12h13.44v5.088h-13.44V32.72h15.12V38zm34.157.48c-2.56 0-4.64-.912-6.24-2.736-1.568-1.824-2.352-4.272-2.352-7.344v-7.152c0-3.104.784-5.568 2.352-7.392 1.6-1.824 3.68-2.736 6.24-2.736 2.368 0 4.24.752 5.616 2.256 1.376 1.472 2.064 3.488 2.064 6.048l-1.776-2.496h1.392l-.192-6.576V2.96h6V38h-5.856v-5.328h-1.344l1.728-2.496c0 2.56-.688 4.592-2.064 6.096-1.344 1.472-3.2 2.208-5.568 2.208m2.256-5.184c1.536 0 2.72-.464 3.552-1.392.864-.928 1.296-2.24 1.296-3.936v-6.336c0-1.696-.432-3.008-1.296-3.936-.832-.928-2.016-1.392-3.552-1.392s-2.736.416-3.6 1.248c-.832.832-1.248 2.112-1.248 3.84v6.816c0 1.696.416 2.976 1.248 3.84.864.832 2.064 1.248 3.6 1.248M140.131 38v-5.424h9.024V17.024h-8.064V11.6h14.064v20.976h8.112V38zm11.616-30.816c-1.216 0-2.176-.304-2.88-.912-.704-.64-1.056-1.488-1.056-2.544s.352-1.888 1.056-2.496c.704-.64 1.664-.96 2.88-.96s2.176.32 2.88.96c.704.608 1.056 1.44 1.056 2.496s-.352 1.904-1.056 2.544c-.704.608-1.664.912-2.88.912M176.544 38c-2.464 0-4.432-.704-5.904-2.112-1.44-1.44-2.16-3.376-2.16-5.808V17.024h-7.296V11.6h7.296V4.16h6.048v7.44h10.512v5.424h-10.512v12.912c0 .768.208 1.408.624 1.92.448.48 1.056.72 1.824.72h7.824V38zm23.021.432c-2.24 0-4.192-.432-5.856-1.296-1.664-.864-2.944-2.08-3.84-3.648-.896-1.6-1.344-3.472-1.344-5.616v-6.144c0-2.176.448-4.048 1.344-5.616.896-1.568 2.176-2.784 3.84-3.648 1.664-.864 3.616-1.296 5.856-1.296 2.272 0 4.224.432 5.856 1.296 1.664.864 2.944 2.08 3.84 3.648.896 1.568 1.344 3.44 1.344 5.616v6.144c0 2.144-.448 4.016-1.344 5.616-.896 1.568-2.176 2.784-3.84 3.648-1.632.864-3.584 1.296-5.856 1.296m0-5.232c1.6 0 2.832-.432 3.696-1.296.896-.896 1.344-2.176 1.344-3.84v-6.528c0-1.696-.448-2.976-1.344-3.84-.864-.864-2.096-1.296-3.696-1.296-1.568 0-2.8.432-3.696 1.296-.896.864-1.344 2.144-1.344 3.84v6.528c0 1.664.448 2.944 1.344 3.84.896.864 2.128 1.296 3.696 1.296m17.357 4.8V11.6h5.856v5.328h1.632l-1.776 1.44c0-2.24.656-4 1.968-5.28 1.344-1.312 3.168-1.968 5.472-1.968 2.688 0 4.784.864 6.288 2.592 1.504 1.728 2.256 4.144 2.256 7.248v2.496h-6v-2.208c0-1.632-.416-2.864-1.248-3.696-.832-.832-2.016-1.248-3.552-1.248-1.568 0-2.784 1.48-3.648 2.44-.832.96-1.248 2.643-1.248 4.08V38z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.27 10.594H.01V38h7.28V22.049h.214l6.102 15.737h4.389l6.102-15.63h.214V38h7.28V10.594h-9.26l-6.37 15.523h-.321zM35.117 38h10.545c2.783 0 5.197-.544 7.24-1.633a11.478 11.478 0 0 0 4.737-4.71c1.115-2.052 1.672-4.505 1.672-7.36 0-2.855-.562-5.304-1.686-7.347a11.335 11.335 0 0 0-4.764-4.71c-2.051-1.097-4.487-1.646-7.306-1.646H35.117zm30.148-27.406 4.497 7.976h.214l4.55-7.976h8.296l-8.19 13.703L83.144 38h-8.51l-4.657-8.136h-.214L65.105 38h-8.458l8.404-13.703-8.136-13.703zm-12.957 12.21v4.94h3.245l-8.635 5.546-8.636-5.547h3.245v-7.196a3.883 3.883 0 0 0-2.853-3.744h7.634a6 6 0 0 1 6 6Z"
      />
    </svg>
  )
}

function EditorChoice({
  selected,
  logo,
  title,
  desc,
  onSelect,
}: {
  selected: boolean
  logo: ReactNode
  title: string
  desc: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex h-auto w-full flex-col items-start gap-3 rounded-2xl border-2 p-5 text-left transition-all',
        selected
          ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/25'
          : 'border-line bg-elevated hover:border-brand-500/40 hover:bg-brand-500/5',
      )}
    >
      <span
        className={cn(
          'flex h-10 items-center',
          selected ? 'text-brand-600 dark:text-brand-300' : 'text-fg-muted',
        )}
      >
        {logo}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-bold text-fg">{title}</span>
        <span className="text-xs font-normal text-fg-subtle">{desc}</span>
      </span>
      {selected && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md">
          <Check width={12} height={12} className="shrink-0" />
        </span>
      )}
    </button>
  )
}

export function MarkdownEditorChoice({
  value,
  onChange,
}: {
  value: MarkdownEditorId
  onChange: (value: MarkdownEditorId) => void
}) {
  const state = useOverlayState()
  const isMdx = value === 'mdx'

  return (
    <>
      <PreferenceRow
        title="倾向使用的 Markdown 编辑器？"
        hint={isMdx ? '所见即所得的富文本编辑体验' : '分栏实时预览，Markdown 源码编辑'}
      >
        <Button size="sm" variant="secondary" onPress={state.open}>
          {isMdx ? '@mdxeditor/editor' : '@uiw/react-md-editor'}
          <ChevronDown width={14} height={14} className="shrink-0" />
        </Button>
      </PreferenceRow>

      <Modal state={state}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Settings2 width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>选择 Markdown 编辑器</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <p className="text-xs text-fg-subtle">
                  选择你偏好的 Markdown 编辑方式，仅影响题目 / 答案的编辑体验。
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorChoice
                    selected={value === 'uiw'}
                    logo={<UiwLogo width={26} height={26} className="shrink-0" />}
                    title="@uiw/react-md-editor"
                    desc="分栏实时预览，Markdown 源码编辑"
                    onSelect={() => {
                      onChange('uiw')
                      state.close()
                    }}
                  />
                  <EditorChoice
                    selected={value === 'mdx'}
                    logo={<MdxEditorLogo width={150} height={24} className="shrink-0" />}
                    title="@mdxeditor/editor"
                    desc="所见即所得的富文本编辑体验"
                    onSelect={() => {
                      onChange('mdx')
                      state.close()
                    }}
                  />
                </div>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
