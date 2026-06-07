import type { PropsWithChildren } from 'react'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info'

const variantClass: Record<Variant, string> = {
  default: 'bg-white/10 text-blue-100 border-white/10',
  success: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  danger: 'bg-red-500/20 text-red-200 border-red-500/30',
  info: 'bg-accent/25 text-blue-200 border-accent/35',
}

export function Badge({ children, variant = 'default' }: PropsWithChildren<{ variant?: Variant }>) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${variantClass[variant]}`}>
      {children}
    </span>
  )
}
