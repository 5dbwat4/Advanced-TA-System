import { useParams } from 'react-router-dom'

import { CheckinScreen } from '@/components/checkin/CheckinScreen'

export default function CheckinSession() {
  const { token } = useParams()
  return <CheckinScreen token={token} />
}
