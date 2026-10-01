import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const isProduction = process.env.NODE_ENV === 'production'

const jwtSecret = required('JWT_SECRET', isProduction ? undefined : 'dev-secret-change-me')

// 凭据加密密钥与 JWT 签名密钥职责不同：生产环境必须单独设置，开发环境回退但告警
let credentialKey = process.env.CREDENTIAL_KEY
if (!credentialKey) {
  if (isProduction) {
    throw new Error('Missing required env var: CREDENTIAL_KEY')
  }
  credentialKey = jwtSecret
  console.warn('CREDENTIAL_KEY 未设置，开发环境回退使用 JWT_SECRET；生产环境必须单独设置')
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret,
  databaseUrl: required('DATABASE_URL', 'file:./dev.db'),
  // 站点根地址（用于生成学生查看链接等绝对 URL），末尾斜杠可有可无
  root: process.env.ROOT ?? 'https://atasaas.5dbwat4.top/',
  // 凭据加密密钥；生产环境应单独设置 CREDENTIAL_KEY
  credentialKey,
  passkeyRpName: process.env.PASSKEY_RP_NAME ?? '计算机系统课程助教系统',
  passkeyRpId: process.env.PASSKEY_RP_ID ?? 'localhost',
  passkeyOrigin: process.env.PASSKEY_ORIGIN ?? 'http://localhost:5173',
}
