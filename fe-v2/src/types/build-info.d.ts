type TaChangelogEntry = {
  hash: string
  date: string
  subject: string
  body: string
}

type TaThirdPartyLicense = {
  name: string
  version: string
  description: string
  homepage: string
  author: string
  license: string
  licenseText: string
}

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __BUILD_CHANGELOG__: TaChangelogEntry[]
declare const __THIRD_PARTY_LICENSES__: TaThirdPartyLicense[]
