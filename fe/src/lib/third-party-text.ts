import type { ThirdPartyLicense } from './third-party'

type LicenseBlock = string | number[]

const licenseTexts: number[][] = __THIRD_PARTY_LICENSE_TEXTS__
const licenseBlocks: LicenseBlock[] = __THIRD_PARTY_LICENSE_BLOCKS__
const licenseLines: string[] = __THIRD_PARTY_LICENSE_LINES__

function readBlock(block: LicenseBlock | undefined): string {
  if (block === undefined) return ''
  if (typeof block === 'string') return block
  let text = ''
  for (let i = 0; i < block.length; i += 1) {
    if (i > 0) text += '\n'
    text += licenseLines[block[i]] ?? ''
  }
  return text
}

function readLicenseText(index: number): string {
  const blocks = licenseTexts[index]
  if (!blocks) return ''
  let text = ''
  for (let i = 0; i < blocks.length; i += 1) {
    if (i > 0) text += '\n'
    text += readBlock(licenseBlocks[blocks[i]])
  }
  return text
}

export function licenseEntryText(item: ThirdPartyLicense): string {
  const meta = [item.homepage, item.author].filter((value) => value.length > 0).join(' · ')
  const raw = readLicenseText(item.licenseTextIndex)
  const text = raw.trim().length > 0 ? raw.trim() : item.license
  return `${item.name}@${item.version}${meta.length > 0 ? `\n${meta}` : ''}\n\n${text}`
}
