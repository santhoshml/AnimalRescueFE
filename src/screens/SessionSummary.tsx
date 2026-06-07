import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import type { RescueSummary } from '../types/rescue'

function urgencyVariant(level: 'low' | 'medium' | 'high' | 'critical' | 'unknown') {
  if (level === 'critical') {
    return 'danger' as const
  }
  if (level === 'high') {
    return 'warning' as const
  }
  if (level === 'medium') {
    return 'info' as const
  }
  if (level === 'unknown') {
    return 'default' as const
  }
  return 'success' as const
}

export function SessionSummary({
  summary,
  onRestart,
}: {
  summary: RescueSummary
  onRestart: () => void
}) {
  const confidence = `${Math.round(summary.speciesPrediction.confidence * 100)}%`

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-8 md:px-6">
      <section className="w-full space-y-4 rounded-3xl border border-white/10 bg-panel/90 p-6 shadow-panel md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-blue-100/60">Session Summary</p>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">Final Rescue Assessment</h1>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
          >
            Start New Session
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <Card title="Final Species Assessment">
            <p className="text-lg font-semibold text-white">{summary.speciesPrediction.species}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="info">Confidence {confidence}</Badge>
              <Badge variant={urgencyVariant(summary.speciesPrediction.urgency)}>
                Urgency {summary.speciesPrediction.urgency.toUpperCase()}
              </Badge>
            </div>
          </Card>

          <Card title="Recommended Next Steps">
            <ol className="space-y-2 text-sm text-blue-100/85">
              {summary.nextSteps.map((step, idx) => (
                <li key={step} className="rounded-xl border border-white/10 bg-black/10 p-2.5">
                  {idx + 1}. {step}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card title="Timeline of Events">
          <div className="space-y-2">
            {summary.timeline.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/10 p-2.5 text-sm"
              >
                <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-blue-100/70">{event.time}</span>
                <p className="text-blue-100/90">{event.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Export / Share">
          <p className="text-sm text-blue-100/80">
            MVP placeholder: add PDF export, share link, and EMS handoff payload from backend APIs.
          </p>
        </Card>
      </section>
    </main>
  )
}
