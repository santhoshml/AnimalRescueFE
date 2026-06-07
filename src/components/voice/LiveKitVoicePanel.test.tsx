import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveKitVoicePanel } from './LiveKitVoicePanel'
import * as React from 'react'

vi.mock('../../lib/api', () => ({
  getLiveKitToken: vi.fn(async () => ({
    token: 'fake-token',
    url: 'wss://fake-livekit.local',
    room: 'room-1',
    caseId: 'case-1',
  })),
  dispatchVoiceAgent: vi.fn(async () => undefined),
}))

vi.mock('@livekit/components-react', () => {
  return {
    LiveKitRoom: ({ onConnected, children }: { onConnected?: () => void; children: React.ReactNode }) => {
      React.useEffect(() => {
        onConnected?.()
      }, [onConnected])
      return <div data-testid="lk-room">{children}</div>
    },
    RoomAudioRenderer: () => null,
    useRoomContext: () => ({
      disconnect: vi.fn(async () => undefined),
    }),
    useLocalParticipant: () => ({
      isMicrophoneEnabled: true,
      localParticipant: {
        setMicrophoneEnabled: vi.fn(async () => undefined),
        trackPublications: new Map(),
      },
    }),
  }
})

describe('LiveKitVoicePanel stop behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns to idle immediately when stop is pressed', async () => {
    const onConnectionChange = vi.fn()
    const user = userEvent.setup()

    render(
      <LiveKitVoicePanel
        roomName="room-1"
        caseId="case-1"
        onConnectionChange={onConnectionChange}
        startLabel="Start Recording"
        stopLabel="Stop Recording"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start Recording' }))
    await screen.findByRole('button', { name: 'Stop Recording' })
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Stop Recording' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop Recording' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Call Ended' })).toBeInTheDocument()
      expect(screen.getByText('Idle')).toBeInTheDocument()
    })
  })
})
