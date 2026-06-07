export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown'

export type CaseStatus = 'open' | 'triaged' | 'guidance_provided' | 'closed' | string

export interface RescueCenter {
  id: string
  name: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  website?: string
}

export interface CaseContext {
  species: string | null
  confidence: number | null
  urgency: string | null
  recommendedAction: string | null
  sourceDocuments: Array<
    | string
    | {
        documentId?: string
        title?: string
        excerpt?: string
        url?: string
      }
  >
  rescueCenters: RescueCenter[]
}

export interface TranscriptMessage {
  text: string
  final?: boolean
  at?: string
}

export interface CaseRecord {
  id: string
  roomName: string
  status: CaseStatus
  createdAt: string
  updatedAt: string
  callerName: string | null
  callerPhone: string | null
  city: string | null
  state?: string | null
  zip: string | null
  country?: string | null
  locationSource?: string | null
  locationConfidence?: number | null
  locationUpdatedAt?: string | null
  animal: string | null
  location: string | null
  injury: string | null
  aggression: string | null
  collar: string | null
  urgency: string | null
  transcript: Array<string | TranscriptMessage>
  images: Array<
    | string
    | {
        id?: string
        filename?: string
        mimeType?: string
        size?: number
        localPath?: string
        uploadedAt?: string
        url?: string
        summary?: string
      }
  >
  protocols: string[]
  guidanceSteps: string[]
  analysisWarnings?: string[]
  context: CaseContext
}

export interface CaseFormInput {
  callerName?: string
  callerPhone?: string
  city?: string
  zip?: string
  animal?: string
  roomName?: string
}

export interface IntakePatch {
  callerName?: string
  callerPhone?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  animal?: string
  location?: string
  injury?: string
  aggression?: string
  collar?: string
}

export interface TokenResponse {
  token: string
  url: string
  room: string
  caseId?: string
}

export interface TokenLocationMetadata {
  telephony?: {
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  numberLookup?: Record<string, unknown>
  callMetadata?: Record<string, unknown>
  providerMetadata?: Record<string, unknown>
}

export interface RecommendationsResponse {
  caseId: string
  rescueCenters: RescueCenter[]
}

export interface KbDocument {
  id: string
  title: string
  type: string
  url: string
  tags?: string[]
  status: 'ready' | 'processing' | 'failed' | string
  uploadedAt: string
  parser: {
    embeddingStatus: 'ready' | 'processing' | 'failed' | string
    parseError: string | null
    errorCode: string | null
    upstreamStatus: number | null
    retryCount: number
    lastTriedAt: string | null
    service?: string | null
    errorType?: string | null
    responseSnippet?: string | null
    requestId?: string | null
    pages?: number
    chunkCount?: number
  }
}

export interface TimelineEvent {
  id: string
  time: string
  type: string
  label: string
}

export interface RescueSummary {
  speciesPrediction: {
    species: string
    confidence: number
    urgency: UrgencyLevel
  }
  timeline: TimelineEvent[]
  nextSteps: string[]
}
