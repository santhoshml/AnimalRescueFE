import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { analyzeCase, eventUrl, getCase, uploadImage } from '../lib/api'
import { formatCallerPhone } from '../lib/phone'
import { LiveKitVoicePanel } from '../components/voice/LiveKitVoicePanel'
import { Card } from '../components/ui/Card'
import heroImage from '../assets/hero.png'
import type { CaseFormInput, CaseRecord } from '../types/rescue'

type AnalyzeReason = 'disconnect_auto' | 'manual_click'
const FINAL_GOODBYE_LINE = 'Thank you! Have a great day and Goodbye'

function normalizeImageItem(image: CaseRecord['images'][number], index: number) {
  if (typeof image === 'string') {
    return { key: `img-${index}-${image}`, href: image, label: image }
  }

  const href = image.url ?? image.localPath ?? ''
  const label = image.filename ?? image.localPath ?? image.url ?? `image-${index + 1}`
  const key = image.id ?? `img-${index}-${label}`

  return { key, href, label }
}

export function LandingPage({
  onStart,
  activeCase,
  onResetCase,
}: {
  onStart: (payload: CaseFormInput) => Promise<void>
  activeCase: CaseRecord | null
  onResetCase: () => void
}) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(activeCase)
  const [voiceConnected, setVoiceConnected] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [endCallSignal, setEndCallSignal] = useState(0)
  const [endCallReason, setEndCallReason] = useState('agent_final_message')
  const [error, setError] = useState<string | null>(null)
  const wasVoiceConnectedRef = useRef(false)
  const hasEndedCallByCaseRef = useRef<Record<string, boolean>>({})
  const analyzeInFlightByCaseRef = useRef<Record<string, boolean>>({})
  const autoAnalyzeDoneByCaseRef = useRef<Record<string, boolean>>({})
  const lastIntakeSignatureByCaseRef = useRef<Record<string, string>>({})
  const lastIncompleteSignatureByCaseRef = useRef<Record<string, string>>({})

  useEffect(() => {
    setCaseRecord(activeCase)
    if (activeCase?.id) {
      hasEndedCallByCaseRef.current[activeCase.id] = false
    }
  }, [activeCase])

  const caseHasFinalGoodbye = (record: CaseRecord) => {
    return record.transcript.some((entry) => {
      const text = typeof entry === 'string' ? entry : entry.text
      return (text ?? '').includes(FINAL_GOODBYE_LINE)
    })
  }

  const triggerCallEnd = (reason: string, record: CaseRecord) => {
    if (hasEndedCallByCaseRef.current[record.id]) {
      return
    }
    hasEndedCallByCaseRef.current[record.id] = true
    setEndCallReason(reason)
    setEndCallSignal((current) => current + 1)
  }

  useEffect(() => {
    if (!caseRecord) {
      return
    }
    const raw = caseRecord.callerPhone ?? ''
    const formatted = formatCallerPhone(raw)
    console.debug('[caller-phone] api-update', {
      caseId: caseRecord.id,
      rawCallerPhone: raw,
      formattedDisplay: formatted,
      userCorrected: false,
    })
  }, [caseRecord?.id, caseRecord?.callerPhone])

  const submit = async () => {
    setError(null)

    setIsStarting(true)
    try {
      await onStart({
        animal: 'Pending Intake',
        city: 'Pending Intake',
        roomName: 'rescue-demo-room',
      })
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to create case.'
      setError(message)
    } finally {
      setIsStarting(false)
    }
  }

  const intakePresence = (record: CaseRecord) => {
    const animal = Boolean(record.animal?.trim())
    const injury = Boolean(record.injury?.trim())
    const aggression = Boolean(record.aggression?.trim())
    const location = Boolean(record.location?.trim() || record.city?.trim() || record.zip?.trim())
    const transcript = Boolean(
      record.transcript.some((entry) => (typeof entry === 'string' ? entry.trim() : entry.text?.trim())),
    )

    return { animal, injury, aggression, location, transcript }
  }

  const intakeSignature = (record: CaseRecord) => {
    const p = intakePresence(record)
    return `${record.animal ?? ''}|${record.injury ?? ''}|${record.aggression ?? ''}|${record.location ?? ''}|${record.city ?? ''}|${record.zip ?? ''}|${record.transcript.length}|${p.animal ? 1 : 0}${p.injury ? 1 : 0}${p.aggression ? 1 : 0}${p.location ? 1 : 0}${p.transcript ? 1 : 0}`
  }

  const hasMinimumIntake = (record: CaseRecord) => {
    const p = intakePresence(record)
    return p.animal || p.injury || p.aggression || p.location || p.transcript
  }

  const isIncompleteGuardError = (message: string) => {
    const upper = message.toUpperCase()
    return upper.includes('CASE_INTAKE_INCOMPLETE') || upper.includes('INTAKE_INCOMPLETE')
  }

  const runAnalysis = async (reason: AnalyzeReason) => {
    if (!caseRecord) {
      console.debug('ANALYZE_BLOCKED', {
        caseId: null,
        reason,
        blockReason: 'missing_case_record',
      })
      return
    }

    const caseId = caseRecord.id
    const signature = intakeSignature(caseRecord)
    lastIntakeSignatureByCaseRef.current[caseId] = signature
    const presence = intakePresence(caseRecord)
    const minimumIntake = hasMinimumIntake(caseRecord)
    const isManual = reason === 'manual_click'
    const allowedReason = reason === 'disconnect_auto' || reason === 'manual_click'

    if (!allowedReason) {
      console.debug('ANALYZE_BLOCKED', {
        caseId,
        reason,
        blockReason: 'invalid_reason',
      })
      return
    }

    console.debug('ANALYZE_ATTEMPT', {
      caseId,
      reason,
      sourceComponent: 'LandingPage',
      hasTranscript: presence.transcript,
      hasAnimal: presence.animal,
      hasInjury: presence.injury,
      hasAggression: presence.aggression,
      hasLocation: presence.location,
    })

    if (!isManual && !minimumIntake) {
      console.debug('ANALYZE_BLOCKED', {
        caseId,
        reason,
        blockReason: 'minimum_intake_not_met',
      })
      return
    }

    if (!isManual && autoAnalyzeDoneByCaseRef.current[caseId]) {
      console.debug('ANALYZE_BLOCKED', {
        caseId,
        reason,
        blockReason: 'auto_analyze_already_done',
      })
      return
    }

    if (analyzeInFlightByCaseRef.current[caseId]) {
      console.debug('ANALYZE_BLOCKED', {
        caseId,
        reason,
        blockReason: 'analyze_in_flight',
      })
      return
    }

    if (!isManual && lastIncompleteSignatureByCaseRef.current[caseId] === signature) {
      console.debug('ANALYZE_BLOCKED', {
        caseId,
        reason,
        blockReason: 'intake_signature_already_marked_incomplete',
      })
      return
    }

    setError(null)
    setIsAnalyzing(true)
    analyzeInFlightByCaseRef.current[caseId] = true
    try {
      const analyzed = await analyzeCase(caseId)
      setCaseRecord(analyzed)
      autoAnalyzeDoneByCaseRef.current[caseId] = true
      delete lastIncompleteSignatureByCaseRef.current[caseId]
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to generate instructions.'
      if (isIncompleteGuardError(message)) {
        console.debug('ANALYZE_BLOCKED', {
          caseId,
          reason,
          blockReason: 'CASE_INTAKE_INCOMPLETE',
        })
        lastIncompleteSignatureByCaseRef.current[caseId] = signature
      } else {
        setError(message)
      }
    } finally {
      analyzeInFlightByCaseRef.current[caseId] = false
      setIsAnalyzing(false)
    }
  }

  const uploadImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !caseRecord) {
      return
    }

    setError(null)
    setIsUploadingImage(true)
    try {
      const updated = await uploadImage(caseRecord.id, file)
      setCaseRecord(updated)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to upload image.'
      setError(message)
    } finally {
      setIsUploadingImage(false)
    }
  }

  useEffect(() => {
    if (wasVoiceConnectedRef.current && !voiceConnected) {
      void runAnalysis('disconnect_auto')
    }
    wasVoiceConnectedRef.current = voiceConnected
  }, [voiceConnected, caseRecord?.id, caseRecord?.animal, caseRecord?.injury, caseRecord?.aggression, caseRecord?.location, caseRecord?.city, caseRecord?.zip, caseRecord?.transcript.length])

  useEffect(() => {
    if (!caseRecord?.id) {
      return
    }

    const source = new EventSource(eventUrl(caseRecord.id))
    source.addEventListener('session_complete', () => {
      void getCase(caseRecord.id).then((latest) => {
        setCaseRecord(latest)
        triggerCallEnd('session_complete', latest)
      })
    })
    source.addEventListener('agent_final_message', () => {
      void getCase(caseRecord.id).then((latest) => {
        setCaseRecord(latest)
        triggerCallEnd('agent_final_message', latest)
      })
    })
    source.addEventListener('case.updated', () => {
      void getCase(caseRecord.id).then((latest) => {
        setCaseRecord(latest)
        if (caseHasFinalGoodbye(latest)) {
          triggerCallEnd('agent_final_message_fallback', latest)
        }
      })
    })
    source.addEventListener('case.transcript.updated', () => {
      void getCase(caseRecord.id).then((latest) => {
        setCaseRecord(latest)
        if (caseHasFinalGoodbye(latest)) {
          triggerCallEnd('agent_final_message_fallback', latest)
        }
      })
    })
    source.addEventListener('case.location.updated', () => {
      void getCase(caseRecord.id).then((latest) => {
        setCaseRecord(latest)
        if (caseHasFinalGoodbye(latest)) {
          triggerCallEnd('agent_final_message_fallback', latest)
        }
      })
    })
    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
    }
  }, [caseRecord?.id])

  const steps = caseRecord?.guidanceSteps.slice(0, 5) ?? []
  const hasInstructions = steps.length > 0 || Boolean(caseRecord?.context.recommendedAction)

  const tokenTelephony =
    caseRecord && (caseRecord.city || caseRecord.state || caseRecord.zip || caseRecord.country)
      ? {
          telephony: {
            city: caseRecord.city ?? undefined,
            state: caseRecord.state ?? undefined,
            zip: caseRecord.zip ?? undefined,
            country: caseRecord.country ?? undefined,
          },
        }
      : undefined

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-white/10 bg-panel/80 p-8 shadow-panel backdrop-blur md:p-12">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-white md:mb-8 md:text-[2.2rem] md:whitespace-nowrap">
          Voice-first AI guidance for animal emergencies.
        </h1>

        <div className="grid items-start gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="animate-riseIn">
            <div className="h-[380px] overflow-hidden rounded-2xl border border-white/10 bg-black/10 p-2 md:h-[430px]">
              <img src={heroImage} alt="Animal rescue hero" className="h-full w-full object-contain" />
            </div>
            <p className="mt-5 max-w-xl text-base text-blue-100/80 md:text-lg">
              Describe what happened, upload photos, and get protocol-grounded rescue steps in
              real time.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-xs text-blue-100/75">
              <span className="rounded-full border border-white/15 px-3 py-1">LiveKit Voice</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Qwen Reasoning</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Unsiloed Retrieval</span>
              <span className="rounded-full border border-white/15 px-3 py-1">MiniMax</span>
              <span className="rounded-full border border-white/15 px-3 py-1">MOSS</span>
            </div>

          </div>

          <div className="rounded-2xl border border-white/10 bg-panelSoft p-5">
            {caseRecord ? (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-blue-100/60">Voice Session</p>
                <LiveKitVoicePanel
                  roomName={caseRecord.roomName}
                  caseId={caseRecord.id}
                  onConnectionChange={setVoiceConnected}
                  startLabel="Start Recording"
                  stopLabel="Stop Recording"
                  tokenMetadata={tokenTelephony}
                  endCallSignal={endCallSignal}
                  endCallReason={endCallReason}
                />

                <Card title="Upload Image">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/10 px-4 py-6 text-center transition hover:border-accent">
                    <span className="flex items-center gap-2 text-sm font-medium text-white">
                      {isUploadingImage ? (
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200/40 border-t-blue-200" />
                      ) : null}
                      {isUploadingImage ? 'Uploading image...' : 'Upload animal image'}
                    </span>
                    <span className="mt-1 text-xs text-blue-100/70">image/*</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={isUploadingImage}
                      onChange={uploadImageFile}
                    />
                  </label>

                  {isAnalyzing ? <p className="mt-3 text-sm text-blue-100/70">Analyzing your recording...</p> : null}

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {caseRecord.images.length ? (
                      caseRecord.images.map((image, index) => {
                        const imageItem = normalizeImageItem(image, index)
                        return (
                        <a
                          key={imageItem.key}
                          href={imageItem.href || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-blue-100/85 hover:underline"
                        >
                          {imageItem.label}
                        </a>
                        )
                      })
                    ) : (
                      <p className="text-sm text-blue-100/70">No images uploaded yet.</p>
                    )}
                  </div>
                </Card>

                <button
                  type="button"
                  onClick={onResetCase}
                  className="w-full rounded-xl border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                >
                  Start New Report
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs uppercase tracking-[0.22em] text-blue-100/60">Start Session</p>
                <p className="mt-4 text-sm text-blue-100/80">
                  Start immediately. Caller profile and location will be captured by the voice agent.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    void submit()
                  }}
                  disabled={isStarting}
                  className="mt-4 w-full rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                >
                  {isStarting ? 'Creating Case...' : 'Start Rescue Session'}
                </button>
              </>
            )}

            {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
          </div>
        </div>

        {caseRecord && (isAnalyzing || hasInstructions) ? (
          <div className="mt-8">
            <Card title="High-Level Instructions" subtitle="Generated after your voice report">
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => {
                    void runAnalysis('manual_click')
                  }}
                  disabled={isAnalyzing}
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white transition hover:bg-white/10 disabled:opacity-70"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Analyze now'}
                </button>
              </div>
              {isAnalyzing ? <p className="text-sm text-blue-100/70">Analyzing your recording...</p> : null}

              {!isAnalyzing && steps.length ? (
                <ol className="space-y-2 text-sm text-blue-100/85">
                  {steps.map((step, index) => (
                    <li key={`${step}-${index}`} className="rounded-xl border border-white/10 bg-black/10 p-3">
                      {index + 1}. {step}
                    </li>
                  ))}
                </ol>
              ) : null}

              {caseRecord.context.recommendedAction ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-blue-100/85">
                  <p className="font-semibold text-white">Recommended Action</p>
                  <p className="mt-1">{caseRecord.context.recommendedAction}</p>
                </div>
              ) : null}
            </Card>
          </div>
        ) : null}
      </section>
    </main>
  )
}
