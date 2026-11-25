export function joinUrl(base: string, key: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return prefix + key.replace(/^\.?\//, '')
}

export function createAssetRouting() {
  const urlForFile = (base: string, filename: string) => joinUrl(base, filename)

  return {
    chunkFileNames: 'assets/[name].[hash].js',
    assetFileNames: 'assets/[name].[hash][extname]',
    urlForFile,
  }
}

export type AssetRouting = ReturnType<typeof createAssetRouting>
