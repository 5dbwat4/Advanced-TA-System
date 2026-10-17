import type { PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'user'>

export async function isUsernameTaken(
  db: Db,
  username: string,
  current: { id: string; studentId: string | null },
): Promise<boolean> {
  const owners = await db.user.findMany({
    where: { username, NOT: { id: current.id } },
    select: { studentId: true },
  })
  if (owners.length === 0) return false
  if (!current.studentId) return true
  return owners.some((owner) => owner.studentId !== current.studentId)
}
