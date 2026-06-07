import type { PropsWithChildren } from 'react'

type CardProps = PropsWithChildren<{
  title?: string
  subtitle?: string
  className?: string
}>

export function Card({ title, subtitle, className, children }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-panel/90 p-4 shadow-panel backdrop-blur ${className ?? ''}`}
    >
      {title ? <h3 className="text-sm font-semibold text-white">{title}</h3> : null}
      {subtitle ? <p className="mt-1 text-xs text-blue-100/75">{subtitle}</p> : null}
      <div className={title || subtitle ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}
