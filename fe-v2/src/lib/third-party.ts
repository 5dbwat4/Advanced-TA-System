export type ThirdPartyLicense = {
  name: string
  version: string
  description: string
  homepage: string
  author: string
  license: string
  licenseText: string
}

export const thirdPartyLicenses: ThirdPartyLicense[] = __THIRD_PARTY_LICENSES__

export function licenseEntryText(item: ThirdPartyLicense): string {
  const meta = [item.homepage, item.author].filter((value) => value.length > 0).join(' · ')
  const text = item.licenseText.trim().length > 0 ? item.licenseText.trim() : item.license
  return `${item.name}@${item.version}${meta.length > 0 ? `\n${meta}` : ''}\n\n${text}`
}
