import { PrismaClient } from '@prisma/client'

import { hashPassword } from '../src/lib/password.js'
import type { Role } from '../src/lib/roles.js'

const prisma = new PrismaClient()

type SeedUser = {
  name: string
  role: Role
  studentId: string
  username: string | null
  password?: string
}

const USERS: SeedUser[] = [
  { name: '王助教', role: 'TA', studentId: '3240100001', username: 'ta', password: 'ta123456' },
  {
    name: '李老师',
    role: 'TEACHER',
    studentId: '3240100002',
    username: 'teacher',
    password: 'teacher123',
  },
  // 预置助教名单（无本地账号/密码，通过统一身份认证登录后完善信息）
  { name: '3240102049', role: 'TA', studentId: '3240102049', username: null },
]

type SeedClass = {
  id: string
  name: string
  type: '2026-sys1' | '2026-sys2' | '2026-sys3'
  /** 学在浙大 课程 / 班级 id，无则为 null */
  xzzdClassId: string | null
}

const CLASSES: SeedClass[] = [
  { id: 'cls-sys2-1', name: '系统II 1班', type: '2026-sys2', xzzdClassId: '100199' },
  { id: 'cls-sys2-2', name: '系统II 2班', type: '2026-sys2', xzzdClassId: null },
  { id: 'cls-sys1-1', name: '系统I 1班', type: '2026-sys1', xzzdClassId: null },
  { id: 'cls-sys3-1', name: '系统III 1班', type: '2026-sys3', xzzdClassId: null },
]

/** 助教 / 教师默认归入的班级（单班模型） */
const STAFF_CLASS_ID = 'cls-sys2-1'

type SeedStudent = {
  id: string
  name: string
  studentId: string
  classId: string
}

const STUDENTS: SeedStudent[] = [
  // 同一学号出现在两个班级 = 两条 User（单班模型）
  { id: 'stu-sys2-1-zhangsan', name: '张三', studentId: '3240101001', classId: 'cls-sys2-1' },
  { id: 'stu-sys2-2-zhangsan', name: '张三', studentId: '3240101001', classId: 'cls-sys2-2' },
  { id: 'stu-sys2-1-lisi', name: '李四', studentId: '3240101002', classId: 'cls-sys2-1' },
  { id: 'stu-sys2-1-wangwu', name: '王五', studentId: '3240101003', classId: 'cls-sys2-1' },
  { id: 'stu-sys2-2-zhaoliu', name: '赵六', studentId: '3240101004', classId: 'cls-sys2-2' },
  { id: 'stu-sys1-1-sunqi', name: '孙七', studentId: '3240102001', classId: 'cls-sys1-1' },
  { id: 'stu-sys3-1-zhouba', name: '周八', studentId: '3240103001', classId: 'cls-sys3-1' },
]

async function main() {
  for (const entry of CLASSES) {
    await prisma.class.upsert({
      where: { id: entry.id },
      update: { name: entry.name, type: entry.type, xzzdClassId: entry.xzzdClassId },
      create: entry,
    })
  }
  console.log(`Seeded ${CLASSES.length} classes.`)

  for (const entry of USERS) {
    const password = entry.password ? await hashPassword(entry.password) : undefined
    const existing = await prisma.user.findFirst({
      where: { studentId: entry.studentId, role: entry.role },
      select: { id: true },
    })
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: entry.name,
          username: entry.username,
          classId: STAFF_CLASS_ID,
          status: 'ACTIVE',
          removedAt: null,
          ...(password ? { password } : {}),
        },
      })
    } else {
      await prisma.user.create({
        data: {
          name: entry.name,
          role: entry.role,
          studentId: entry.studentId,
          username: entry.username,
          password: password ?? null,
          classId: STAFF_CLASS_ID,
        },
      })
    }
    console.log(`✓ ${entry.role.padEnd(7)} ${entry.name} (${entry.studentId})`)
  }
  console.log(`\nSeeded ${USERS.length} staff users.`)

  for (const entry of STUDENTS) {
    await prisma.user.upsert({
      where: { id: entry.id },
      update: {
        name: entry.name,
        studentId: entry.studentId,
        classId: entry.classId,
        role: 'STUDENT',
        status: 'ACTIVE',
        removedAt: null,
      },
      create: {
        id: entry.id,
        name: entry.name,
        studentId: entry.studentId,
        classId: entry.classId,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    })
  }
  console.log(`Seeded ${STUDENTS.length} students.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
