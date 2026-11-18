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
  licenseTextIndex: number
}

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __BUILD_CHANGELOG__: TaChangelogEntry[]
declare const __THIRD_PARTY_LICENSES__: TaThirdPartyLicense[]
declare const __THIRD_PARTY_LICENSE_TEXTS__: number[][]
declare const __THIRD_PARTY_LICENSE_BLOCKS__: (string | number[])[]
declare const __THIRD_PARTY_LICENSE_LINES__: string[]
