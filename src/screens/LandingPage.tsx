import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { analyzeCase, patchIntake, uploadImage } from '../lib/api'
import { formatCallerPhone } from '../lib/phone'
import { LiveKitVoicePanel } from '../components/voice/LiveKitVoicePanel'
import { Card } from '../components/ui/Card'
import heroImage from '../assets/hero.png'
import type { CaseFormInput, CaseRecord } from '../types/rescue'

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
  const [error, setError] = useState<string | null>(null)
  const wasVoiceConnectedRef = useRef(false)

  useEffect(() => {
    setCaseRecord(activeCase)
  }, [activeCase])

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

  const runAnalysis = async () => {
    if (!caseRecord) {
      return
    }

    setError(null)
    setIsAnalyzing(true)
    try {
      const analyzed = await analyzeCase(caseRecord.id)
      setCaseRecord(analyzed)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to generate instructions.'
      setError(message)
    } finally {
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
      void runAnalysis()
    }
    wasVoiceConnectedRef.current = voiceConnected
  }, [voiceConnected])

  const steps = caseRecord?.guidanceSteps.slice(0, 5) ?? []
  const hasInstructions = steps.length > 0 || Boolean(caseRecord?.context.recommendedAction)

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
              <span className="rounded-full border border-white/15 px-3 py-1">TrueFoundry Agents</span>
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
                  callerPhone={caseRecord.callerPhone}
                  requirePhoneConfirmation
                  onPhoneConfirm={async (nextPhone, wasCorrected) => {
                    const raw = caseRecord.callerPhone ?? ''
                    const formatted = formatCallerPhone(nextPhone || raw)
                    console.debug('[caller-phone] confirm', {
                      caseId: caseRecord.id,
                      rawCallerPhone: raw,
                      formattedDisplay: formatted,
                      userCorrected: wasCorrected,
                    })

                    if (wasCorrected) {
                      const updated = await patchIntake(caseRecord.id, { callerPhone: nextPhone })
                      setCaseRecord(updated)
                    }
                  }}
                />

                <Card title="Upload Image">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/10 px-4 py-6 text-center transition hover:border-accent">
                    <span className="text-sm font-medium text-white">
                      {isUploadingImage ? 'Uploading image...' : 'Upload animal image'}
                    </span>
                    <span className="mt-1 text-xs text-blue-100/70">image/*</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={uploadImageFile} />
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
