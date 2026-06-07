import { useCallback, useEffect, useMemo, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant } from '@livekit/components-react'
import { getLiveKitToken } from '../../lib/api'
import { Card } from '../ui/Card'
import { StatusDot } from '../ui/StatusDot'

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

export function LiveKitVoicePanel({
  roomName,
  caseId,
  onConnectionChange,
  startLabel = 'Start Recording',
  stopLabel = 'Stop Recording',
  className,
  callerPhone,
  requirePhoneConfirmation = false,
  onPhoneConfirm,
}: {
  roomName: string
  caseId: string
  onConnectionChange: (connected: boolean) => void
  startLabel?: string
  stopLabel?: string
  className?: string
  callerPhone?: string | null
  requirePhoneConfirmation?: boolean
  onPhoneConfirm?: (nextPhone: string, wasCorrected: boolean) => Promise<void> | void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>('')
  const [isFetching, setIsFetching] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isConfirmingStop, setIsConfirmingStop] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const identity = useMemo(() => `case-${caseId}-${crypto.randomUUID().slice(0, 6)}`, [caseId])

  const startVoice = useCallback(async () => {
    setError(null)
    setIsFetching(true)

    try {
      console.debug('[livekit] token request payload', { room: roomName, identity, caseId })
      const response = await getLiveKitToken(roomName, identity, caseId)
      console.debug('[livekit] token response', { room: response.room, caseId: response.caseId ?? caseId })
      setToken(response.token)
      setServerUrl(response.url)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to start voice session.'
      setError(message)
    } finally {
      setIsFetching(false)
    }
  }, [identity, roomName])

  const performStop = useCallback(() => {
    setToken(null)
    setIsConnected(false)
    setError(null)
    onConnectionChange(false)
  }, [onConnectionChange])

  const stopVoice = useCallback(() => {
    if (requirePhoneConfirmation) {
      setPhoneDraft(callerPhone ?? '')
      setIsConfirmingStop(true)
      return
    }
    performStop()
  }, [callerPhone, performStop, requirePhoneConfirmation])

  const confirmStop = useCallback(async () => {
    setError(null)
    setIsStopping(true)
    try {
      const current = (callerPhone ?? '').trim()
      const next = phoneDraft.trim()
      const wasCorrected = next !== current
      if (onPhoneConfirm) {
        await onPhoneConfirm(next, wasCorrected)
      }
      setIsConfirmingStop(false)
      performStop()
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to confirm phone.'
      setError(message)
    } finally {
      setIsStopping(false)
    }
  }, [callerPhone, onPhoneConfirm, performStop, phoneDraft])

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
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
          >
            {stopLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void startVoice()
            }}
            disabled={isFetching}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {isFetching ? 'Starting...' : startLabel}
          </button>
        )}
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

      {isConfirmingStop ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
          <p className="text-xs text-blue-100/80">Confirm caller phone before disconnecting.</p>
          <p className="mt-1 text-xs text-blue-100/70">Captured: {callerPhone?.trim() || 'Not captured yet'}</p>
          <input
            value={phoneDraft}
            onChange={(event) => setPhoneDraft(event.target.value)}
            placeholder="Correct phone if needed"
            className="mt-2 w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white placeholder:text-blue-100/40"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setIsConfirmingStop(false)}
              className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmStop()
              }}
              disabled={isStopping}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-70"
            >
              {isStopping ? 'Saving...' : 'Confirm & Stop'}
            </button>
          </div>
        </div>
      ) : null}

      {token && serverUrl ? (
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          audio
          video={false}
          className="h-0 w-0 overflow-hidden"
          onConnected={() => {
            setIsConnected(true)
            onConnectionChange(true)
          }}
          onDisconnected={() => {
            setIsConnected(false)
            onConnectionChange(false)
          }}
          onError={(connectError) => {
            setError(connectError.message)
          }}
        >
          <MicPublisher onError={setError} />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : null}
    </Card>
  )
}
