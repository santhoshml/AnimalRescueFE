import { useCallback, useEffect, useState } from 'react'
import { listKbDocuments } from '../lib/api'
import type { KbDocument } from '../types/rescue'

export function useKbDocumentsStream() {
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await listKbDocuments()
      setDocuments(rows)
      setError(null)
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to load KB documents.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    documents,
    setDocuments,
    isLoading,
    error,
    refresh,
  }
}
