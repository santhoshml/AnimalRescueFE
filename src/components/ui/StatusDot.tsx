export function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        active ? 'bg-success shadow-[0_0_12px_rgba(33,196,123,0.9)] animate-pulseSoft' : 'bg-white/30'
      }`}
      aria-hidden
    />
  )
}
