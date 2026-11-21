import copyToClipboard from 'copy-to-clipboard'
import { toast } from 'sonner'

export async function copyText(text: string, label: string) {
  const ok = await copyToClipboard(text)
  if (ok) toast.success(`已复制${label}`)
  else toast.error('复制失败')
}
