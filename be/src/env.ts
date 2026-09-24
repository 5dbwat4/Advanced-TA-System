import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const jwtSecret = required('JWT_SECRET', 'dev-secret-change-me')

export const env = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret,
  databaseUrl: required('DATABASE_URL', 'file:./dev.db'),
  // 凭据加密密钥；生产环境应单独设置 CREDENTIAL_KEY，未设置时回退到 jwtSecret
  credentialKey: process.env.CREDENTIAL_KEY ?? jwtSecret,
  passkeyRpName: process.env.PASSKEY_RP_NAME ?? 'CS-II 助教系统',
  passkeyRpId: process.env.PASSKEY_RP_ID ?? 'localhost',
  passkeyOrigin: process.env.PASSKEY_ORIGIN ?? 'http://localhost:5173',
}
