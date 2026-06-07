export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-white/10">
      <div
        className="h-2 rounded-full bg-gradient-to-r from-accent to-emerald-400 transition-all duration-700"
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  )
}
