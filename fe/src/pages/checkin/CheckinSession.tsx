import { useNavigate, useParams } from 'react-router-dom'

import { CheckinScreen } from '@/components/checkin/CheckinScreen'

export default function CheckinSession() {
  const { token } = useParams()
  const navigate = useNavigate()
  return <CheckinScreen token={token} onBack={() => navigate('/checkin')} />
}
