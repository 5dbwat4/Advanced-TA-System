import { Navigate } from 'react-router-dom'

import { FIRST_DOC } from '@/content/docs'

export default function DocsIndex() {
  return <Navigate to={`/docs/${FIRST_DOC?.slug ?? ''}`} replace />
}
