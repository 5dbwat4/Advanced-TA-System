export type ThirdPartyLicense = {
  name: string
  version: string
  description: string
  homepage: string
  author: string
  license: string
  licenseTextIndex: number
}

export const thirdPartyLicenses: ThirdPartyLicense[] = __THIRD_PARTY_LICENSES__
