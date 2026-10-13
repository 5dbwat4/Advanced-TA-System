import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { licenseEntryText, thirdPartyLicenses } from '@/lib/third-party'

const SEPARATOR = `\n\n${'='.repeat(80)}\n\n`

export default function LicensesFull() {
  return (
    <>
      <PageHeader title="Third Party Licenses" />
      <Card index={0} className="flex flex-col">
        {thirdPartyLicenses.map((item, index) => (
          <pre
            key={`${item.name}@${item.version}`}
            className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-fg-muted [contain-intrinsic-size:auto_600px] [content-visibility:auto]"
          >
            {index === 0 ? licenseEntryText(item) : `${SEPARATOR}${licenseEntryText(item)}`}
          </pre>
        ))}
      </Card>
    </>
  )
}
