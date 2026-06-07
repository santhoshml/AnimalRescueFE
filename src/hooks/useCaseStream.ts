import { useEffect, useMemo, useRef, useState } from 'react'
import { eventUrl, getCase } from '../lib/api'
import type { CaseRecord, TimelineEvent } from '../types/rescue'

const SUBSCRIBED_EVENTS = [
  'ready',
  'case.created',
  'case.updated',
  'transcript.updated',
  'image.uploaded',
  'protocol.uploaded',
  'recommendations.updated',
  'analysis.completed',
  'case.closed',
] as const

function asCaseRecord(value: unknown): CaseRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  if ('id' in value && 'status' in value) {
    return value as CaseRecord
  }

  return null
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case 'case.created':
      return 'Case created'
    case 'case.updated':
      return 'Case intake updated'
    case 'transcript.updated':
      return 'Transcript updated'
    case 'image.uploaded':
      return 'Image uploaded'
    case 'protocol.uploaded':
      return 'Protocol uploaded'
    case 'recommendations.updated':
      return 'Recommendations refreshed'
    case 'analysis.completed':
      return 'Analysis completed'
    case 'case.closed':
      return 'Case closed'
    default:
      return eventType
  }
}

export function useCaseStream(caseId: string | null, initialCase: CaseRecord | null) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(initialCase)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [streamConnected, setStreamConnected] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [hasClosedEvent, setHasClosedEvent] = useState(false)
  const [clockTick, setClockTick] = useState(0)

  const sourceRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setCaseRecord(initialCase)
    setTimeline([])
    setStreamError(null)
    setStreamConnected(false)
    setHasClosedEvent(false)
  }, [caseId, initialCase])

  useEffect(() => {
    if (!caseId) {
      return
    }

    let cancelled = false

    const cleanup = () => {
      if (sourceRef.current) {
        sourceRef.current.close()
        sourceRef.current = null
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const appendEvent = (type: string) => {
      const event: TimelineEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: nowLabel(),
        type,
        label: eventLabel(type),
      }
      setTimeline((current) => [event, ...current].slice(0, 40))
      if (type === 'case.closed') {
        setHasClosedEvent(true)
      }
    }

    const reconnect = () => {
      if (cancelled) {
        return
      }

      reconnectTimerRef.current = window.setTimeout(async () => {
        try {
          const snapshot = await getCase(caseId)
          if (!cancelled) {
            setCaseRecord(snapshot)
            setStreamError(null)
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'Failed to re-sync case snapshot.'
            setStreamError(message)
          }
        }

        if (!cancelled) {
          connect()
        }
      }, 1500)
    }

    const connect = () => {
      cleanup()

      const source = new EventSource(eventUrl(caseId))
      sourceRef.current = source

      source.onopen = () => {
        setStreamConnected(true)
        setStreamError(null)
      }

      source.onerror = () => {
        setStreamConnected(false)
        setStreamError('Realtime stream disconnected. Reconnecting...')
        reconnect()
      }

      SUBSCRIBED_EVENTS.forEach((eventType) => {
        source.addEventListener(eventType, (event) => {
          const payload = (() => {
            try {
              return JSON.parse((event as MessageEvent).data)
            } catch {
              return null
            }
          })()

          const maybeCase = asCaseRecord(payload)
          if (maybeCase) {
            setCaseRecord(maybeCase)
          }

          appendEvent(eventType)
        })
      })
    }

    connect()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [caseId])

  useEffect(() => {
    if (!caseRecord) {
      return
    }

    const timer = window.setInterval(() => {
      setClockTick((value) => value + 1)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [caseRecord])

  const elapsedLabel = useMemo(() => {
    if (!caseRecord?.createdAt) {
      return '00:00'
    }

    const start = new Date(caseRecord.createdAt).getTime()
    const now = Date.now()
    const seconds = Math.max(0, Math.floor((now - start) / 1000))
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0')
    const secs = String(seconds % 60).padStart(2, '0')
    return `${mins}:${secs}`
  }, [caseRecord?.createdAt, clockTick])

  return {
    caseRecord,
    setCaseRecord,
    timeline,
    streamConnected,
    streamError,
    hasClosedEvent,
    elapsedLabel,
  }
}
