import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  analyzeCase,
  closeCase,
  getRecommendations,
  patchIntake,
  pushTranscript,
  uploadImage,
} from '../lib/api'
import { useCaseStream } from '../hooks/useCaseStream'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StatusDot } from '../components/ui/StatusDot'
import { LiveKitVoicePanel } from '../components/voice/LiveKitVoicePanel'
import type { CaseRecord, RescueSummary, TranscriptMessage, UrgencyLevel } from '../types/rescue'

function urgencyVariant(level: UrgencyLevel) {
  if (level === 'critical') {
    return 'danger' as const
  }
  if (level === 'high') {
    return 'warning' as const
  }
  if (level === 'medium') {
    return 'info' as const
  }
  return 'success' as const
}

function normalizeUrgency(value: string | null | undefined): UrgencyLevel {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value
  }
  return 'unknown'
}

function toTranscriptRows(rows: Array<string | TranscriptMessage>) {
  return rows.map((row, index) => {
    if (typeof row === 'string') {
      return {
        id: `line-${index}`,
        speaker: index % 2 === 0 ? 'user' : 'copilot',
        text: row,
        time: '',
      }
    }

    return {
      id: `line-${index}`,
      speaker: index % 2 === 0 ? 'user' : 'copilot',
      text: row.text,
      time: row.at ?? '',
    }
  })
}

function normalizeSourceDocument(source: CaseRecord['context']['sourceDocuments'][number], index: number) {
  if (typeof source === 'string') {
    return {
      key: `source-${index}-${source}`,
      href: source,
      label: source,
      excerpt: null as string | null,
    }
  }

  const href = source.url ?? ''
  const label = source.title ?? source.url ?? source.documentId ?? `Document ${index + 1}`

  return {
    key: source.documentId ?? `source-${index}-${label}`,
    href,
    label,
    excerpt: source.excerpt ?? null,
  }
}

function normalizeImageItem(image: CaseRecord['images'][number], index: number) {
  if (typeof image === 'string') {
    return { key: `img-${index}-${image}`, href: image, label: image }
  }

  const href = image.url ?? image.localPath ?? ''
  const label = image.filename ?? image.localPath ?? image.url ?? `image-${index + 1}`
  const key = image.id ?? `img-${index}-${label}`

  return { key, href, label }
}

export function RescueDashboard({
  initialCase,
  onBack,
  onFinish,
}: {
  initialCase: CaseRecord
  onBack: () => void
  onFinish: (summary: RescueSummary) => void
}) {
  const [sessionCaseId] = useState(initialCase.id)
  const [voiceConnected, setVoiceConnected] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [draftTranscript, setDraftTranscript] = useState('')
  const [isSubmittingTranscript, setIsSubmittingTranscript] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false)
  const [isRefreshingRecommendations, setIsRefreshingRecommendations] = useState(false)
  const [isClosingCase, setIsClosingCase] = useState(false)
  const [pendingClose, setPendingClose] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { caseRecord, setCaseRecord, timeline, streamConnected, streamError, hasClosedEvent, elapsedLabel } =
    useCaseStream(sessionCaseId, initialCase)

  const [intakeDraft, setIntakeDraft] = useState({
    animal: initialCase.animal ?? '',
    location: initialCase.location ?? '',
    injury: initialCase.injury ?? '',
    aggression: initialCase.aggression ?? '',
    collar: initialCase.collar ?? '',
  })

  useEffect(() => {
    if (!caseRecord || !pendingClose || !hasClosedEvent || caseRecord.status !== 'closed') {
      return
    }

    const confidence = caseRecord.context.confidence ?? 0
    const urgency = normalizeUrgency(caseRecord.context.urgency ?? caseRecord.urgency)

    onFinish({
      speciesPrediction: {
        species: caseRecord.context.species ?? 'Unknown species',
        confidence,
        urgency,
      },
      timeline,
      nextSteps:
        caseRecord.guidanceSteps.length > 0
          ? caseRecord.guidanceSteps
          : ['Share this summary with a licensed animal rescue center.'],
    })
  }, [caseRecord, hasClosedEvent, onFinish, pendingClose, timeline])

  useEffect(() => {
    if (!caseRecord) {
      return
    }

    setIntakeDraft((current) => ({
      ...current,
      animal: caseRecord.animal ?? current.animal,
      location: caseRecord.location ?? current.location,
      injury: caseRecord.injury ?? current.injury,
      aggression: caseRecord.aggression ?? current.aggression,
      collar: caseRecord.collar ?? current.collar,
    }))
  }, [caseRecord])

  if (!caseRecord) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
        <div className="rounded-2xl border border-white/10 bg-panel p-6 text-sm text-blue-100/80">
          Loading case...
        </div>
      </main>
    )
  }

  const transcriptRows = toTranscriptRows(caseRecord.transcript)
  const confidenceValue = caseRecord.context.confidence ?? 0
  const confidenceLabel = `${Math.round(confidenceValue * 100)}%`

  const analysisProgress =
    caseRecord.status === 'guidance_provided'
      ? 100
      : caseRecord.images.length > 0
        ? 45
        : caseRecord.transcript.length > 0
          ? 25
          : 10

  const uploadImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setErrorMessage(null)
    setIsUploadingImage(true)
    try {
      const updated = await uploadImage(caseRecord.id, file)
      setCaseRecord(updated)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to upload image.'
      setErrorMessage(message)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const submitTranscript = async () => {
    const text = draftTranscript.trim()
    if (!text) {
      return
    }

    setErrorMessage(null)
    setIsSubmittingTranscript(true)
    try {
      const updated = await pushTranscript(caseRecord.id, text)
      setCaseRecord(updated)
      setDraftTranscript('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to push transcript.'
      setErrorMessage(message)
    } finally {
      setIsSubmittingTranscript(false)
    }
  }

  const saveIntake = async () => {
    setErrorMessage(null)
    try {
      const updated = await patchIntake(caseRecord.id, {
        animal: intakeDraft.animal || undefined,
        location: intakeDraft.location || undefined,
        injury: intakeDraft.injury || undefined,
        aggression: intakeDraft.aggression || undefined,
        collar: intakeDraft.collar || undefined,
      })
      setCaseRecord(updated)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update intake.'
      setErrorMessage(message)
    }
  }

  const runAnalysis = async () => {
    setErrorMessage(null)
    setIsRunningAnalysis(true)
    try {
      const updated = await analyzeCase(sessionCaseId)
      setCaseRecord(updated)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Analysis failed.'
      setErrorMessage(message)
    } finally {
      setIsRunningAnalysis(false)
    }
  }

  const refreshRecommendations = async () => {
    setErrorMessage(null)
    setIsRefreshingRecommendations(true)
    try {
      const response = await getRecommendations(caseRecord.id)
      setCaseRecord((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          context: {
            ...current.context,
            rescueCenters: response.rescueCenters,
          },
        }
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Recommendations refresh failed.'
      setErrorMessage(message)
    } finally {
      setIsRefreshingRecommendations(false)
    }
  }

  const closeCurrentCase = async () => {
    setErrorMessage(null)
    setPendingClose(true)
    setIsClosingCase(true)
    try {
      const updated = await closeCase(caseRecord.id)
      setCaseRecord(updated)
    } catch (error: unknown) {
      setPendingClose(false)
      const message = error instanceof Error ? error.message : 'Close case failed.'
      setErrorMessage(message)
    } finally {
      setIsClosingCase(false)
    }
  }

  const wasVoiceConnectedRef = useRef(false)

  useEffect(() => {
    if (wasVoiceConnectedRef.current && !voiceConnected) {
      void runAnalysis()
    }
    wasVoiceConnectedRef.current = voiceConnected
  }, [voiceConnected])

  const urgency = normalizeUrgency(caseRecord.context.urgency ?? caseRecord.urgency)

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-panel/80 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-blue-100/60">Animal Rescue Copilot</p>
          <h1 className="text-lg font-semibold text-white">Rescue Session Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-blue-100/80">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5">
            <StatusDot active={streamConnected} /> {streamConnected ? 'Stream Live' : 'Reconnecting'}
          </span>
          <span className="rounded-full border border-white/15 px-3 py-1.5">Case {caseRecord.status}</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5">Elapsed {elapsedLabel}</span>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-white transition hover:bg-white/10"
          >
            Exit
          </button>
        </div>
      </header>

      {streamError ? (
        <p className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          {streamError}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {caseRecord.analysisWarnings?.length ? (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <p className="font-semibold text-amber-200">Analysis warnings</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {caseRecord.analysisWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <LiveKitVoicePanel
            roomName={caseRecord.roomName}
            caseId={sessionCaseId}
            onConnectionChange={setVoiceConnected}
          />

          <Card title="Live Transcript" subtitle="POST transcript updates + SSE stream">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowTranscript((current) => !current)}
                className="w-full rounded-lg border border-white/20 px-3 py-2 text-xs text-white transition hover:bg-white/10"
              >
                {showTranscript ? 'Hide transcript' : 'Show transcript'}
              </button>

              {showTranscript ? (
                <>
                  <div className="flex gap-2">
                    <input
                      value={draftTranscript}
                      onChange={(event) => setDraftTranscript(event.target.value)}
                      placeholder="Type transcript line to push..."
                      className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white placeholder:text-blue-100/40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void submitTranscript()
                      }}
                      disabled={isSubmittingTranscript}
                      className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-70"
                    >
                      Send
                    </button>
                  </div>

                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {transcriptRows.length ? (
                      transcriptRows.map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-white/10 bg-black/10 p-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-white/90">
                              {entry.speaker === 'user' ? 'Caller' : 'Copilot'}
                            </span>
                            <span className="text-blue-100/60">{entry.time}</span>
                          </div>
                          <p className="mt-1 text-blue-100/85">{entry.text}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100/65">
                        No transcript yet. Start voice or push lines manually.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-blue-100/65">
                  Hidden by default for a cleaner caller experience.
                </p>
              )}
            </div>
          </Card>

          <Card title="Structured Intake">
            <div className="space-y-2">
              <input
                value={intakeDraft.animal}
                onChange={(event) => setIntakeDraft((current) => ({ ...current, animal: event.target.value }))}
                placeholder="Animal"
                className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
              />
              <input
                value={intakeDraft.location}
                onChange={(event) => setIntakeDraft((current) => ({ ...current, location: event.target.value }))}
                placeholder="Location"
                className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
              />
              <input
                value={intakeDraft.injury}
                onChange={(event) => setIntakeDraft((current) => ({ ...current, injury: event.target.value }))}
                placeholder="Injury"
                className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={intakeDraft.aggression}
                  onChange={(event) =>
                    setIntakeDraft((current) => ({ ...current, aggression: event.target.value }))
                  }
                  placeholder="Aggression"
                  className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
                />
                <input
                  value={intakeDraft.collar}
                  onChange={(event) => setIntakeDraft((current) => ({ ...current, collar: event.target.value }))}
                  placeholder="Collar"
                  className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void saveIntake()
                }}
                className="w-full rounded-lg border border-white/20 px-3 py-2 text-xs text-white transition hover:bg-white/10"
              >
                Save Intake
              </button>
            </div>
          </Card>

        </aside>

        <section className="space-y-4">
          <Card title="Image Upload" subtitle="POST /cases/:id/upload/image">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/10 px-4 py-8 text-center transition hover:border-accent">
              <span className="text-sm font-medium text-white">
                {isUploadingImage ? 'Uploading image...' : 'Upload animal image'}
              </span>
              <span className="mt-1 text-xs text-blue-100/70">max 10MB • image/*</span>
              <input type="file" accept="image/*" className="sr-only" onChange={uploadImageFile} />
            </label>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {caseRecord.images.length ? (
                caseRecord.images.map((image, index) => {
                  const imageItem = normalizeImageItem(image, index)
                  return (
                  <a
                    key={imageItem.key}
                    href={imageItem.href || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-blue-100/80"
                  >
                    {imageItem.label}
                  </a>
                  )
                })
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-center text-xs text-blue-100/65">
                  No images uploaded yet.
                </div>
              )}
            </div>
          </Card>

          <Card title="AI Analysis" subtitle="POST /cases/:id/analyze">
            <div className="space-y-3">
              <ProgressBar value={analysisProgress} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void runAnalysis()
                  }}
                  disabled={isRunningAnalysis}
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-70"
                >
                  {isRunningAnalysis ? 'Analyzing...' : 'Run Analysis'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void refreshRecommendations()
                  }}
                  disabled={isRefreshingRecommendations}
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white disabled:opacity-70"
                >
                  {isRefreshingRecommendations ? 'Refreshing...' : 'Refresh Recommendations'}
                </button>
              </div>
            </div>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card title="Context Panel">
            <div className="space-y-3 text-sm text-blue-100/85">
              <div>
                <p className="text-xs text-blue-100/70">Species Prediction</p>
                <p className="font-semibold text-white">{caseRecord.context.species ?? 'Pending'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="info">Confidence {confidenceLabel}</Badge>
                <Badge variant={urgencyVariant(urgency)}>Urgency {urgency.toUpperCase()}</Badge>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100/80">
                <p className="font-medium text-white">Recommended Action</p>
                <p className="mt-1">{caseRecord.context.recommendedAction ?? 'Waiting for analysis results.'}</p>
              </div>
            </div>
          </Card>

          <Card title="Guidance Steps">
            <div className="space-y-2 text-xs text-blue-100/85">
              {caseRecord.guidanceSteps.length ? (
                caseRecord.guidanceSteps.map((step, index) => (
                  <div key={`${step}-${index}`} className="rounded-xl border border-white/10 bg-black/10 p-3">
                    {index + 1}. {step}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-blue-100/65">
                  No guidance yet. Run analysis after uploading image.
                </div>
              )}
            </div>
          </Card>

          <Card title="Protocol Sources (Read Only)">
            <div className="space-y-2 text-xs">
              {caseRecord.context.sourceDocuments.length ? (
                caseRecord.context.sourceDocuments.map((source, index) => {
                  const doc = normalizeSourceDocument(source, index)

                  if (doc.href) {
                    return (
                      <a
                        key={doc.key}
                        href={doc.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-white/10 bg-black/10 p-3 text-blue-100/80"
                      >
                        <p className="truncate">{doc.label}</p>
                        {doc.excerpt ? <p className="mt-1 text-blue-100/65">{doc.excerpt}</p> : null}
                      </a>
                    )
                  }

                  return (
                    <div key={doc.key} className="rounded-xl border border-white/10 bg-black/10 p-3 text-blue-100/80">
                      <p className="truncate">{doc.label}</p>
                      {doc.excerpt ? <p className="mt-1 text-blue-100/65">{doc.excerpt}</p> : null}
                    </div>
                  )
                })
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-blue-100/65">
                  Protocol documents are managed by admins and cited after analysis.
                </div>
              )}
            </div>
          </Card>

          <Card title="Nearby Rescue Resources">
            <div className="space-y-2">
              {caseRecord.context.rescueCenters.length ? (
                caseRecord.context.rescueCenters.map((resource) => (
                  <div key={resource.id} className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs">
                    <p className="font-medium text-white">{resource.name}</p>
                    <p className="mt-1 text-blue-100/70">
                      {[resource.city, resource.state, resource.zip].filter(Boolean).join(', ')}
                    </p>
                    {resource.phone ? <p className="text-blue-100/90">{resource.phone}</p> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100/65">
                  No rescue centers yet. Use refresh after intake includes city/zip.
                </div>
              )}
            </div>
          </Card>

          <Card title="Event Timeline">
            <div className="max-h-60 space-y-2 overflow-auto pr-1 text-xs">
              {timeline.length ? (
                timeline.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 p-2.5">
                    <p className="text-blue-100/65">{item.time}</p>
                    <p className="text-blue-100/90">{item.label}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-blue-100/65">
                  Waiting for realtime events.
                </div>
              )}
            </div>
          </Card>

          <button
            type="button"
            onClick={() => {
              void closeCurrentCase()
            }}
            disabled={isClosingCase || pendingClose}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingClose ? 'Waiting for close event...' : isClosingCase ? 'Closing case...' : 'Close Case'}
          </button>
        </aside>
      </section>
    </main>
  )
}
