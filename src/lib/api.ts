import type {
  CaseFormInput,
  CaseRecord,
  IntakePatch,
  KbDocument,
  RecommendationsResponse,
  TokenResponse,
} from '../types/rescue'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const raw = await response.text()
    let message = `Request failed (${response.status})`

    try {
      const json = JSON.parse(raw) as { error?: string }
      if (json.error) {
        message = json.error
      }
    } catch {
      if (raw) {
        message = raw
      }
    }

    throw new Error(message)
  }

  return (await response.json()) as T
}

export async function createCase(payload: CaseFormInput): Promise<CaseRecord> {
  const response = await fetch(`${BASE_URL}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function getCase(caseId: string): Promise<CaseRecord> {
  const response = await fetch(`${BASE_URL}/cases/${caseId}`)
  return parseOrThrow<CaseRecord>(response)
}

export async function listCases(): Promise<CaseRecord[]> {
  const response = await fetch(`${BASE_URL}/cases`)
  const payload = await parseOrThrow<unknown>(response)

  const pickArray = (value: unknown): CaseRecord[] | null => {
    if (Array.isArray(value)) {
      return value as CaseRecord[]
    }

    if (!value || typeof value !== 'object') {
      return null
    }

    const candidate = value as {
      data?: unknown
      cases?: unknown
      items?: unknown
      result?: unknown
    }

    return (
      pickArray(candidate.items) ??
      pickArray(candidate.cases) ??
      pickArray(candidate.data) ??
      pickArray(candidate.result)
    )
  }

  return pickArray(payload) ?? []
}

export async function patchIntake(caseId: string, payload: IntakePatch): Promise<CaseRecord> {
  const response = await fetch(`${BASE_URL}/cases/${caseId}/intake`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function pushTranscript(caseId: string, text: string): Promise<CaseRecord> {
  const response = await fetch(`${BASE_URL}/cases/${caseId}/transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, final: true }),
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function uploadImage(caseId: string, file: File): Promise<CaseRecord> {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${BASE_URL}/cases/${caseId}/upload/image`, {
    method: 'POST',
    body,
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function uploadProtocol(caseId: string, file: File): Promise<CaseRecord> {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${BASE_URL}/cases/${caseId}/upload/protocol`, {
    method: 'POST',
    body,
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function listKbDocuments(): Promise<KbDocument[]> {
  const response = await fetch(`${BASE_URL}/kb/documents`)
  return parseOrThrow<KbDocument[]>(response)
}

export async function uploadKbDocument(file: File, type?: string): Promise<KbDocument> {
  const body = new FormData()
  body.append('file', file)
  if (type) {
    body.append('type', type)
  }

  return uploadKbDocumentForm(body)
}

export async function uploadKbDocumentForm(formData: FormData): Promise<KbDocument> {
  const response = await fetch(`${BASE_URL}/kb/documents`, {
    method: 'POST',
    body: formData,
  })

  return parseOrThrow<KbDocument>(response)
}

export async function retryKbDocument(id: string, force = false): Promise<KbDocument> {
  const response = await fetch(`${BASE_URL}/kb/documents/${id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(force ? { force: true } : {}),
  })

  return parseOrThrow<KbDocument>(response)
}

export async function deleteKbDocument(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/kb/documents/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    await parseOrThrow<void>(response)
  }
}

export async function analyzeCase(caseId: string): Promise<CaseRecord> {
  const analyzeUrl = `${BASE_URL}/cases/${caseId}/analyze`
  console.debug('[analyze] request URL', `/cases/${caseId}/analyze`)
  const response = await fetch(analyzeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function getRecommendations(caseId: string): Promise<RecommendationsResponse> {
  const response = await fetch(`${BASE_URL}/cases/${caseId}/recommendations`)
  return parseOrThrow<RecommendationsResponse>(response)
}

export async function closeCase(caseId: string): Promise<CaseRecord> {
  const response = await fetch(`${BASE_URL}/cases/${caseId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return parseOrThrow<CaseRecord>(response)
}

export async function getLiveKitToken(room: string, identity: string, caseId: string): Promise<TokenResponse> {
  const response = await fetch(`${BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, identity, caseId }),
  })

  return parseOrThrow<TokenResponse>(response)
}

export function eventUrl(caseId: string): string {
  return `${BASE_URL}/events/${caseId}`
}

export function kbEventUrl(): string {
  return `${BASE_URL}/events/kb`
}
