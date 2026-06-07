import { Fragment, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  deleteKbDocument,
  getCase,
  listCases,
  retryKbDocument,
  updateCaseStatus,
  uploadKbDocumentForm,
} from '../lib/api'
import { formatCallerPhone } from '../lib/phone'
import { useKbDocumentsStream } from '../hooks/useKbDocumentsStream'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import type { CaseRecord, KbDocument } from '../types/rescue'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

function statusBadge(status: KbDocument['status']) {
  if (status === 'ready') {
    return <Badge variant="success">ready</Badge>
  }
  if (status === 'failed') {
    return <Badge variant="danger">failed</Badge>
  }
  return (
    <Badge variant="info">
      <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-200" />
      processing
    </Badge>
  )
}

function upsertDocument(current: KbDocument[], next: KbDocument): KbDocument[] {
  const filtered = current.filter((item) => item.id !== next.id)
  return [next, ...filtered].sort((a, b) => {
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  })
}

function transcriptText(caseRecord: CaseRecord): string {
  return caseRecord.transcript
    .map((entry) => (typeof entry === 'string' ? entry : entry.text))
    .filter(Boolean)
    .join('\n')
}

function caseDisplayLabel(caseRecord: CaseRecord): string {
  const animal = caseRecord.animal?.trim() || 'Unknown animal'
  const city = caseRecord.city?.trim() || caseRecord.zip?.trim() || 'Unknown location'
  const date = new Date(caseRecord.createdAt).toLocaleString()
  return `${animal}, ${city}, ${date}`
}

function toAbsoluteUrl(path: string): string {
  if (!path) {
    return ''
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  if (path.startsWith('/')) {
    return `${API_BASE_URL}${path}`
  }
  return `${API_BASE_URL}/${path}`
}

function normalizeCaseImage(image: CaseRecord['images'][number], index: number) {
  if (typeof image === 'string') {
    return {
      key: `image-${index}-${image}`,
      src: toAbsoluteUrl(image),
      filename: image.split('/').pop() || `image-${index + 1}`,
      uploadedAt: null as string | null,
      summary: null as string | null,
    }
  }

  const src = toAbsoluteUrl(image.url ?? image.localPath ?? '')
  const fallbackName = src.split('/').pop() || `image-${index + 1}`
  return {
    key: image.id ?? `image-${index}-${src}`,
    src,
    filename: image.filename ?? fallbackName,
    uploadedAt: image.uploadedAt ?? null,
    summary: image.summary?.trim() || null,
  }
}

export function AdminConsole({
  seededCases,
  onLogout,
}: {
  seededCases: CaseRecord[]
  onLogout: () => void
}) {
  const [activeTab, setActiveTab] = useState<'cases' | 'docs'>('cases')
  const [statusFilter, setStatusFilter] = useState('open')
  const [cityFilter, setCityFilter] = useState('all')
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null)
  const [statusDraftByCase, setStatusDraftByCase] = useState<Record<string, string>>({})
  const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null)
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null)
  const [isLoadingCases, setIsLoadingCases] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [expandedFailureIds, setExpandedFailureIds] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const {
    documents,
    setDocuments,
    isLoading: isLoadingKb,
    refresh: refreshKb,
  } = useKbDocumentsStream()

  const cityOptions = useMemo(() => {
    const values = new Set<string>()
    for (const item of cases) {
      const city = item.city?.trim()
      if (city) {
        values.add(city)
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [cases])

  const statusOptions = [
    'open',
    'triaged',
    'guidance_provided',
    'rescue_onway',
    'rescue_complete',
    'closed',
  ] as const

  const filteredCases = useMemo(() => {
    return cases.filter((item) => {
      const statusMatch = statusFilter === 'all' ? true : item.status === statusFilter
      const cityValue = item.city?.trim() ?? ''
      const cityMatch = cityFilter === 'all' ? true : cityValue === cityFilter
      return statusMatch && cityMatch
    })
  }, [cases, cityFilter, statusFilter])

  const refreshCases = async () => {
    setError(null)
    setIsLoadingCases(true)
    try {
      const backendCases = await listCases()
      setCases(backendCases)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load cases.'
      setError(`${message} Showing local recent cases only.`)
      setCases(seededCases)
    } finally {
      setIsLoadingCases(false)
    }
  }

  useEffect(() => {
    void refreshCases()
  }, [])

  useEffect(() => {
    if (!cases.length) {
      setCases(seededCases)
    }
  }, [cases.length, seededCases])

  useEffect(() => {
    if (!selectedCase) {
      return
    }

    const totalImages = selectedCase.images.length
    const imagesWithSummary = selectedCase.images.filter((image) => {
      return typeof image !== 'string' && Boolean(image.summary?.trim())
    }).length

    console.debug('[admin-case] selected-case', {
      caseId: selectedCase.id,
      totalImages,
      imagesWithSummary,
    })
  }, [selectedCase])

  const loadCase = async (caseId: string) => {
    if (!caseId.trim()) {
      return
    }

    setError(null)
    setIsLoadingCases(true)

    try {
      const fresh = await getCase(caseId.trim())
      const totalImages = fresh.images.length
      const imagesWithSummary = fresh.images.filter((image) => {
        return typeof image !== 'string' && Boolean(image.summary?.trim())
      }).length
      console.debug('[admin-case] load/update', {
        caseId: fresh.id,
        totalImages,
        imagesWithSummary,
      })
      setSelectedCase(fresh)
      setCases((current) => {
        const index = current.findIndex((item) => item.id === fresh.id)
        if (index === -1) {
          return current
        }

        const next = [...current]
        next[index] = fresh
        return next
      })
    } catch (caughtError: unknown) {
      const seeded = seededCases.find((item) => item.id === caseId.trim())
      if (seeded) {
        setSelectedCase(seeded)
      } else {
        const message = caughtError instanceof Error ? caughtError.message : 'Case fetch failed.'
        setError(message)
      }
    } finally {
      setIsLoadingCases(false)
    }
  }

  const changeSelectedCaseStatus = async (caseRecord: CaseRecord) => {
    setError(null)
    setUpdatingCaseId(caseRecord.id)
    try {
      const nextStatus = statusDraftByCase[caseRecord.id] ?? caseRecord.status
      const updated = await updateCaseStatus(caseRecord.id, nextStatus)
      setSelectedCase(updated)
      setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setStatusDraftByCase((current) => ({ ...current, [caseRecord.id]: updated.status }))
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Status update failed.'
      setError(message)
    } finally {
      setUpdatingCaseId(null)
    }
  }

  const onKbDocSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setError(null)
    setIsUploading(true)

    const body = new FormData()
    body.append('file', file)

    try {
      const uploaded = await uploadKbDocumentForm(body)
      setDocuments((current) => upsertDocument(current, uploaded))
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'KB upload failed.'
      setError(message)
    } finally {
      setIsUploading(false)
    }
  }

  const retryFailed = async (docId: string) => {
    setError(null)
    try {
      const retried = await retryKbDocument(docId)
      setDocuments((current) => upsertDocument(current, retried))
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Retry failed.'
      setError(message)
    }
  }

  const removeDoc = async (docId: string) => {
    setError(null)
    try {
      await deleteKbDocument(docId)
      setDocuments((current) => current.filter((item) => item.id !== docId))
      setExpandedFailureIds((current) => {
        const next = { ...current }
        delete next[docId]
        return next
      })
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Delete failed.'
      setError(message)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1360px] px-4 py-5 md:px-6 md:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-panel/80 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-blue-100/60">Admin Mode</p>
          <h1 className="text-lg font-semibold text-white">Case Monitor + Knowledge Base Management</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshCases()
              void refreshKb()
            }}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white transition hover:bg-white/10"
          >
            {isLoadingCases || isLoadingKb ? 'Loading...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Logout
          </button>
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <section>
        <div className="mb-4 flex w-full rounded-xl border border-white/15 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('cases')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs transition ${
              activeTab === 'cases' ? 'bg-accent text-white' : 'text-blue-100/80 hover:bg-white/10'
            }`}
          >
            Cases
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`flex-1 rounded-lg px-3 py-2 text-xs transition ${
              activeTab === 'docs' ? 'bg-accent text-white' : 'text-blue-100/80 hover:bg-white/10'
            }`}
          >
            Upload Docs
          </button>
        </div>

        {activeTab === 'cases' ? (
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">All Cases</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={cityFilter}
                  onChange={(event) => setCityFilter(event.target.value)}
                  className="w-auto min-w-[140px] rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
                >
                  <option value="all">All cities</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-auto min-w-[140px] rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              {filteredCases.length ? (
                filteredCases.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCase?.id === item.id) {
                          setSelectedCase(null)
                          return
                        }
                        void loadCase(item.id)
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-left text-xs transition hover:border-accent"
                    >
                      <div>
                        <p className="font-medium text-white">{caseDisplayLabel(item)}</p>
                      </div>
                      <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-blue-100/80">
                        {item.status}
                      </span>
                    </button>

                    {selectedCase?.id === item.id ? (
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100/80">
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                            <p className="rounded-lg border border-accent/40 bg-accent px-3 py-2 text-sm font-bold text-white">
                              Rescue team notified
                            </p>
                            <select
                              value={statusDraftByCase[selectedCase.id] ?? selectedCase.status}
                              onChange={(event) =>
                                setStatusDraftByCase((current) => ({
                                  ...current,
                                  [selectedCase.id]: event.target.value,
                                }))
                              }
                              className="rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs text-white"
                            >
                              {statusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                void changeSelectedCaseStatus(selectedCase)
                              }}
                              disabled={updatingCaseId === selectedCase.id}
                              className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                            >
                              {updatingCaseId === selectedCase.id ? 'Updating...' : 'Change State'}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Status</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.status}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Updated</p>
                              <p className="text-sm font-semibold text-white">
                                {new Date(selectedCase.updatedAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Caller</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.callerName ?? 'N/A'}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Phone</p>
                              <p className="text-sm font-semibold text-white">
                                {formatCallerPhone(selectedCase.callerPhone) || 'N/A'}
                              </p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Injury</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.injury ?? 'N/A'}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Aggression</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.aggression ?? 'N/A'}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Images</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.images.length}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Urgency</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.urgency ?? 'N/A'}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Rescue Centers</p>
                              <p className="text-sm font-semibold text-white">{selectedCase.context.rescueCenters.length}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                              <p className="text-[11px] text-blue-100/60">Recommended action</p>
                              <p className="text-sm font-semibold text-white">
                                {selectedCase.context.recommendedAction ? 'Yes' : 'No'}
                              </p>
                            </div>
                          </div>

                          {selectedCase.images.length ? (
                            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                              <p className="mb-2 text-[11px] text-blue-100/60">Attached Images</p>
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                {selectedCase.images.map((image, index) => {
                                  const itemImage = normalizeCaseImage(image, index)
                                  return (
                                    <button
                                      key={itemImage.key}
                                      type="button"
                                      onClick={() => setPreviewImageSrc(itemImage.src)}
                                      className="rounded-lg border border-white/10 bg-black/20 p-2 text-left"
                                    >
                                      <div className="h-24 w-full overflow-hidden rounded-md bg-black/30">
                                        {itemImage.src ? (
                                          <img
                                            src={itemImage.src}
                                            alt={itemImage.filename}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-[11px] text-blue-100/60">
                                            No preview
                                          </div>
                                        )}
                                      </div>
                                      <p className="mt-2 truncate text-[11px] font-medium text-white">
                                        {itemImage.filename}
                                      </p>
                                      <p className="mt-1 text-[10px] text-blue-100/70">
                                        {itemImage.uploadedAt
                                          ? new Date(itemImage.uploadedAt).toLocaleString()
                                          : 'Upload time unavailable'}
                                      </p>
                                      <p className="mt-1 text-[10px] text-blue-100/80">
                                        {itemImage.summary ?? 'Summary not available yet.'}
                                      </p>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}

                          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                            <p className="mb-1 text-[11px] text-blue-100/60">Transcript</p>
                            <textarea
                              readOnly
                              value={transcriptText(selectedCase)}
                              rows={8}
                              className="w-full resize-y rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-blue-100/90"
                            />
                          </div>

                          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                            <p className="mb-1 text-[11px] text-blue-100/60">Guidance Steps</p>
                            <textarea
                              readOnly
                              value={selectedCase.guidanceSteps.join('\n')}
                              rows={8}
                              className="w-full resize-y rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-blue-100/90"
                            />
                          </div>

                          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                            <p className="mb-2 text-[11px] text-blue-100/60">Case Context</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                                <p className="text-[11px] text-blue-100/60">Predicted species</p>
                                <p className="text-xs text-blue-100/90">{selectedCase.context.species ?? 'N/A'}</p>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                                <p className="text-[11px] text-blue-100/60">Context urgency</p>
                                <p className="text-xs text-blue-100/90">{selectedCase.context.urgency ?? 'N/A'}</p>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                                <p className="text-[11px] text-blue-100/60">Confidence</p>
                                <p className="text-xs text-blue-100/90">
                                  {selectedCase.context.confidence != null
                                    ? `${Math.round(selectedCase.context.confidence * 100)}%`
                                    : 'N/A'}
                                </p>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                                <p className="text-[11px] text-blue-100/60">Source documents</p>
                                <p className="text-xs text-blue-100/90">{selectedCase.context.sourceDocuments.length}</p>
                              </div>
                            </div>

                            <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-2">
                              <p className="text-[11px] text-blue-100/60">Documents</p>
                              {selectedCase.context.sourceDocuments.length ? (
                                <ul className="mt-1 space-y-1 text-xs text-blue-100/90">
                                  {selectedCase.context.sourceDocuments.map((source, index) => {
                                    const label =
                                      typeof source === 'string'
                                        ? source
                                        : source.title ?? source.documentId ?? source.url ?? `Document ${index + 1}`
                                    return <li key={`${label}-${index}`}>{label}</li>
                                  })}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs text-blue-100/70">No documents linked.</p>
                              )}
                            </div>

                            <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-2">
                              <p className="text-[11px] text-blue-100/60">Nearby rescue centers</p>
                              {selectedCase.context.rescueCenters.length ? (
                                <ul className="mt-1 space-y-1 text-xs text-blue-100/90">
                                  {selectedCase.context.rescueCenters.map((center) => (
                                    <li key={center.id}>
                                      {center.name}
                                      {center.phone ? ` (${center.phone})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs text-blue-100/70">No rescue centers listed.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : cases.length ? (
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100/65">
                  No cases match the selected filters.
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-blue-100/65">
                  No cases available.
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card title="Knowledge Base Upload">
              <div className="space-y-3">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/25 bg-black/10 px-4 py-8 text-center transition hover:border-accent">
                  <span className="text-sm font-medium text-white">
                    {isUploading ? 'Uploading document...' : 'Upload KB PDF'}
                  </span>
                  <span className="mt-1 text-xs text-blue-100/70">application/pdf</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={isUploading}
                    onChange={onKbDocSelected}
                  />
                </label>
              </div>
            </Card>

            <Card title="Knowledge Base Documents">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-blue-100/70">
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Uploaded</th>
                    <th className="px-2 py-2">RetryCount</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length ? (
                    documents.map((doc) => {
                      const isFailed = doc.status === 'failed'
                      const showFailure = Boolean(expandedFailureIds[doc.id])

                      return (
                        <Fragment key={doc.id}>
                          <tr className="border-b border-white/5 align-top">
                            <td className="px-2 py-2">
                              <p className="max-w-[200px] truncate text-white" title={doc.title}>
                                {doc.title}
                              </p>
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="max-w-[200px] truncate text-[11px] text-blue-300 hover:underline"
                              >
                                {doc.url}
                              </a>
                            </td>
                            <td className="px-2 py-2 text-blue-100/80">{doc.type}</td>
                            <td className="px-2 py-2">{statusBadge(doc.status)}</td>
                            <td className="px-2 py-2 text-blue-100/80">
                              {new Date(doc.uploadedAt).toLocaleString()}
                            </td>
                            <td className="px-2 py-2 text-blue-100/80">{doc.parser.retryCount}</td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1">
                                {isFailed ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void retryFailed(doc.id)
                                    }}
                                    className="rounded-md border border-amber-400/50 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20"
                                  >
                                    Retry
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    void removeDoc(doc.id)
                                  }}
                                  className="rounded-md border border-red-400/50 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20"
                                >
                                  Delete
                                </button>
                                {isFailed ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedFailureIds((current) => ({
                                        ...current,
                                        [doc.id]: !current[doc.id],
                                      }))
                                    }}
                                    className="rounded-md border border-white/25 px-2 py-1 text-[11px] text-blue-100/80 hover:bg-white/10"
                                  >
                                    {showFailure ? 'Hide details' : 'Show details'}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>

                          {isFailed && showFailure ? (
                            <tr key={`${doc.id}-details`} className="border-b border-white/5">
                              <td colSpan={6} className="px-2 pb-3">
                                <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-[11px] text-red-100">
                                  <p>
                                    <span className="text-red-200/80">parseError:</span>{' '}
                                    {doc.parser.parseError ?? 'N/A'}
                                  </p>
                                  <p>
                                    <span className="text-red-200/80">errorCode:</span>{' '}
                                    {doc.parser.errorCode ?? 'N/A'}
                                  </p>
                                  <p>
                                    <span className="text-red-200/80">upstreamStatus:</span>{' '}
                                    {doc.parser.upstreamStatus ?? 'N/A'}
                                  </p>
                                  <p>
                                    <span className="text-red-200/80">lastTriedAt:</span>{' '}
                                    {doc.parser.lastTriedAt
                                      ? new Date(doc.parser.lastTriedAt).toLocaleString()
                                      : 'N/A'}
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-2 py-3 text-blue-100/65">
                        {isLoadingKb ? 'Loading KB docs...' : 'No KB docs yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </section>

      {previewImageSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setPreviewImageSrc(null)}
        >
          <div className="max-h-[90vh] max-w-5xl overflow-hidden rounded-xl border border-white/20 bg-black/40 p-2">
            <img src={previewImageSrc} alt="Attached preview" className="max-h-[86vh] w-auto max-w-full object-contain" />
          </div>
        </div>
      ) : null}
    </main>
  )
}
