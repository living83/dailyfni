import type { ReactNode } from 'react'

export default function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground/20 mb-4">{icon}</div>
      <p className="text-sm text-muted-foreground font-medium">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 mt-1">{description}</p>
      )}
    </div>
  )
}
