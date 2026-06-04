export default function Toggle({
  enabled,
  onToggle,
  size = 'md',
}: {
  enabled: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
}) {
  const trackClass = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6'
  const thumbClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const translate = size === 'sm' ? 'translate-x-4' : 'translate-x-5'

  return (
    <button
      onClick={onToggle}
      className={`relative ${trackClass} rounded-full transition-colors ${
        enabled ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 ${thumbClass} rounded-full bg-white transition-transform ${
          enabled ? translate : 'translate-x-0'
        }`}
      />
    </button>
  )
}
