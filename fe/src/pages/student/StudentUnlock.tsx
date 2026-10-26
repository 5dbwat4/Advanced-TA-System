import { Navigate } from 'react-router-dom'

/** 学生解封已并入统一初始化页 */
export default function StudentUnlock() {
  return <Navigate to="/setup" replace />
}
