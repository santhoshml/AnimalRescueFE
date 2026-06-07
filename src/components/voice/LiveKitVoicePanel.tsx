import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { dispatchVoiceAgent, getLiveKitToken } from '../../lib/api'
import { Card } from '../ui/Card'
import { StatusDot } from '../ui/StatusDot'
import type { TokenLocationMetadata } from '../../types/rescue'

function MicPublisher({ onError }: { onError: (message: string) => void }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()

  useEffect(() => {
    if (isMicrophoneEnabled) {
      return
    }

    localParticipant.setMicrophoneEnabled(true).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to publish microphone.'
      onError(message)
    })
  }, [isMicrophoneEnabled, localParticipant, onError])

  return null
}

function EndCallController({
  endRequest,
  caseId,
  onComplete,
}: {
  endRequest: { id: number; reason: string } | null
  caseId: string
  onComplete: (reason: string) => void
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const handledRequestRef = useRef<number | null>(null)

  useEffect(() => {
    if (!endRequest || handledRequestRef.current === endRequest.id) {
      return
    }

    handledRequestRef.current = endRequest.id
    let cancelled = false

    const withTimeout = async <T,>(operation: Promise<T>, timeoutMs: number) => {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        }),
      ])
    }

    const stopAndDisconnect = async () => {
      try {
        try {
          await withTimeout(localParticipant.setMicrophoneEnabled(false), 1500)
        } catch {
          // Ignore mic disable failures; continue hard stop.
        }

        const publications = Array.from((localParticipant as any).trackPublications?.values?.() ?? [])
        for (const publication of publications as Array<{ track?: { kind?: string; stop?: () => void } }>) {
          const track = publication.track
          if (track?.kind === 'audio') {
            try {
              track.stop?.()
            } catch {
              // Ignore local stop failures.
            }
          }
        }
        console.debug('CALL_MEDIA_STOPPED', { caseId })

        try {
          await withTimeout(room.disconnect(), 2000)
        } catch (disconnectError: unknown) {
          console.error('CALL_ROOM_DISCONNECT_FAIL', {
            caseId,
            error: disconnectError instanceof Error ? disconnectError.message : String(disconnectError),
          })
        }
        console.debug('CALL_ROOM_DISCONNECTED', { caseId })
      } finally {
        if (!cancelled) {
          onComplete(endRequest.reason)
        }
      }
    }

    void stopAndDisconnect()

    return () => {
      cancelled = true
    }
  }, [caseId, endRequest, localParticipant, onComplete, room])

  return null
}

export function LiveKitVoicePanel({
  roomName,
  caseId,
  onConnectionChange,
  startLabel = 'Start Recording',
  stopLabel = 'Stop Recording',
  className,
  tokenMetadata,
  endCallSignal = 0,
  endCallReason = 'agent_completion',
}: {
  roomName: string
  caseId: string
  onConnectionChange: (connected: boolean) => void
  startLabel?: string
  stopLabel?: string
  className?: string
  tokenMetadata?: TokenLocationMetadata
  endCallSignal?: number
  endCallReason?: string
}) {
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>('')
  const [sessionRoom, setSessionRoom] = useState<string>(roomName)
  const [sessionCaseId, setSessionCaseId] = useState<string>(caseId)
  const [isFetching, setIsFetching] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [hasEndedCall, setHasEndedCall] = useState(false)
  const [endRequest, setEndRequest] = useState<{ id: number; reason: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dispatchInFlightRef = useRef<Record<string, boolean>>({})
  const dispatchedByCaseRef = useRef<Record<string, boolean>>({})
  const handledEndSignalRef = useRef<number>(0)
  const forcedStopTimerRef = useRef<number | null>(null)

  const identity = useMemo(() => `case-${caseId}-${crypto.randomUUID().slice(0, 6)}`, [caseId])

  const requestEndCall = useCallback(
    (reason: string) => {
      const targetCaseId = sessionCaseId || caseId
      if (hasEndedCall) {
        return
      }
      console.debug('CALL_END_TRIGGERED', {
        caseId: targetCaseId,
        room: sessionRoom || roomName,
        reason,
      })
      setEndRequest({ id: Date.now(), reason })
    },
    [caseId, hasEndedCall, roomName, sessionCaseId, sessionRoom],
  )

  const startVoice = useCallback(async () => {
    if (hasEndedCall) {
      return
    }
    setHasEndedCall(false)
    setError(null)
    setIsFetching(true)

    try {
      console.debug('[livekit] token request payload', {
        room: roomName,
        identity,
        caseId,
        ...(tokenMetadata ?? {}),
      })
      const response = await getLiveKitToken(roomName, identity, caseId, tokenMetadata)
      const resolvedRoom = response.room || roomName
      const resolvedCaseId = response.caseId ?? caseId
      console.debug('TOKEN_RECEIVED', { room: resolvedRoom, identity, caseId: resolvedCaseId })
      setToken(response.token)
      setServerUrl(response.url)
      setSessionRoom(resolvedRoom)
      setSessionCaseId(resolvedCaseId)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to start voice session.'
      setError(message)
    } finally {
      setIsFetching(false)
    }
  }, [caseId, hasEndedCall, identity, roomName, tokenMetadata])

  const performStop = useCallback(() => {
    if (forcedStopTimerRef.current !== null) {
      window.clearTimeout(forcedStopTimerRef.current)
      forcedStopTimerRef.current = null
    }
    setToken(null)
    setServerUrl('')
    setIsConnected(false)
    setError(null)
    onConnectionChange(false)
  }, [onConnectionChange])

  const scheduleForcedStop = useCallback(() => {
    if (forcedStopTimerRef.current !== null) {
      window.clearTimeout(forcedStopTimerRef.current)
    }
    forcedStopTimerRef.current = window.setTimeout(() => {
      setHasEndedCall(true)
      performStop()
    }, 2500)
  }, [performStop])

  const stopVoice = useCallback(() => {
    setHasEndedCall(true)
    performStop()
    requestEndCall('user_stop')
    scheduleForcedStop()
  }, [performStop, requestEndCall, scheduleForcedStop])

  useEffect(() => {
    if (!endCallSignal || endCallSignal === handledEndSignalRef.current) {
      return
    }
    handledEndSignalRef.current = endCallSignal
    setHasEndedCall(true)
    performStop()
    requestEndCall(endCallReason)
    scheduleForcedStop()
  }, [endCallReason, endCallSignal, performStop, requestEndCall, scheduleForcedStop])

  useEffect(() => {
    return () => {
      if (forcedStopTimerRef.current !== null) {
        window.clearTimeout(forcedStopTimerRef.current)
      }
    }
  }, [])

  return (
    <Card title="Voice Conversation" subtitle="Talk naturally" className={className}>
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-panelSoft px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-blue-100/80">
          <StatusDot active={isConnected} />
          {isConnected ? 'Connected' : token ? 'Connecting' : 'Idle'}
        </div>
        {token ? (
          <button
            type="button"
            onClick={stopVoice}
            disabled={hasEndedCall}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
          >
            {hasEndedCall ? 'Call Ended' : stopLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void startVoice()
            }}
            disabled={isFetching || hasEndedCall}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {hasEndedCall ? 'Call Ended' : isFetching ? 'Starting...' : startLabel}
          </button>
        )}
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
      {hasEndedCall ? <p className="mt-3 text-xs text-blue-100/80">Call ended.</p> : null}

      {token && serverUrl ? (
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          audio
          video={false}
          className="h-0 w-0 overflow-hidden"
          onConnected={() => {
            console.debug('ROOM_JOINED', { room: sessionRoom, identity, caseId: sessionCaseId })
            setIsConnected(true)
            onConnectionChange(true)
            if (dispatchedByCaseRef.current[sessionCaseId] || dispatchInFlightRef.current[sessionCaseId]) {
              return
            }
            dispatchInFlightRef.current[sessionCaseId] = true
            const payload = { room: sessionRoom, identity, caseId: sessionCaseId }
            console.debug('AGENT_DISPATCH_REQUEST', payload)
            void dispatchVoiceAgent(payload)
              .then(() => {
                dispatchedByCaseRef.current[sessionCaseId] = true
                console.debug('AGENT_DISPATCH_SUCCESS', { room: sessionRoom, caseId: sessionCaseId })
              })
              .catch((dispatchError: unknown) => {
                const message =
                  dispatchError instanceof Error ? dispatchError.message : 'Agent dispatch failed.'
                console.error('AGENT_DISPATCH_FAIL', {
                  room: sessionRoom,
                  caseId: sessionCaseId,
                  error: message,
                })
                setError(message)
              })
              .finally(() => {
                dispatchInFlightRef.current[sessionCaseId] = false
              })
          }}
          onDisconnected={() => {
            if (forcedStopTimerRef.current !== null) {
              window.clearTimeout(forcedStopTimerRef.current)
              forcedStopTimerRef.current = null
            }
            setIsConnected(false)
            onConnectionChange(false)
          }}
          onError={(connectError) => {
            setError(connectError.message)
          }}
        >
          <MicPublisher onError={setError} />
          <EndCallController
            endRequest={endRequest}
            caseId={sessionCaseId}
            onComplete={() => {
              setHasEndedCall(true)
              performStop()
            }}
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : null}
    </Card>
  )
}
