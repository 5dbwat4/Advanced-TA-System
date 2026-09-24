import { PrismaClient } from '@prisma/client'

import { hashPassword } from '../src/lib/password'
import type { Role } from '../src/lib/roles'

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

type SeedStudent = {
  stuId: string
  name: string
  studentNo: string
  classId: string
}

const STUDENTS: SeedStudent[] = [
  // 同一学号出现在两个班级，演示「一人多班」规则
  { stuId: 'stu-sys2-1-zhangsan', name: '张三', studentNo: '3240101001', classId: 'cls-sys2-1' },
  { stuId: 'stu-sys2-2-zhangsan', name: '张三', studentNo: '3240101001', classId: 'cls-sys2-2' },
  { stuId: 'stu-sys2-1-lisi', name: '李四', studentNo: '3240101002', classId: 'cls-sys2-1' },
  { stuId: 'stu-sys2-1-wangwu', name: '王五', studentNo: '3240101003', classId: 'cls-sys2-1' },
  { stuId: 'stu-sys2-2-zhaoliu', name: '赵六', studentNo: '3240101004', classId: 'cls-sys2-2' },
  { stuId: 'stu-sys1-1-sunqi', name: '孙七', studentNo: '3240102001', classId: 'cls-sys1-1' },
  { stuId: 'stu-sys3-1-zhouba', name: '周八', studentNo: '3240103001', classId: 'cls-sys3-1' },
]

async function main() {
  for (const entry of USERS) {
    const password = entry.password ? await hashPassword(entry.password) : undefined
    await prisma.user.upsert({
      where: { studentId: entry.studentId },
      update: {
        name: entry.name,
        role: entry.role,
        username: entry.username,
        ...(password ? { password } : {}),
      },
      create: {
        name: entry.name,
        role: entry.role,
        studentId: entry.studentId,
        username: entry.username,
        password: password ?? null,
      },
    })
    console.log(`✓ ${entry.role.padEnd(7)} ${entry.name} (${entry.studentId})`)
  }
  console.log(`\nSeeded ${USERS.length} users.`)

  for (const entry of CLASSES) {
    await prisma.class.upsert({
      where: { id: entry.id },
      update: { name: entry.name, type: entry.type, xzzdClassId: entry.xzzdClassId },
      create: entry,
    })
  }
  console.log(`Seeded ${CLASSES.length} classes.`)

  for (const entry of STUDENTS) {
    await prisma.student.upsert({
      where: { stuId: entry.stuId },
      update: { name: entry.name, studentNo: entry.studentNo, classId: entry.classId },
      create: entry,
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
