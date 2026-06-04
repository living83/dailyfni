const presets: Record<string, string> = {
  // Posting status
  '발행완료': 'bg-emerald/15 text-emerald',
  '발행중': 'bg-amber/15 text-amber animate-pulse',
  '대기중': 'bg-muted text-muted-foreground',
  '실패': 'bg-destructive/15 text-destructive',
  // Content status
  '검수완료': 'bg-emerald/15 text-emerald',
  '생성중': 'bg-primary/15 text-primary animate-pulse',
  '저품질': 'bg-destructive/15 text-destructive',
  '대기': 'bg-muted text-muted-foreground',
  // Tone
  '친근톤': 'bg-emerald/15 text-emerald',
  '전문톤': 'bg-primary/15 text-primary',
  '리뷰톤': 'bg-amber/15 text-amber',
  // Grade
  A: 'bg-emerald/15 text-emerald',
  B: 'bg-primary/15 text-primary',
  C: 'bg-amber/15 text-amber',
  D: 'bg-destructive/15 text-destructive',
  // Severity
  '정보': 'bg-primary/15 text-primary',
  '경고': 'bg-amber/15 text-amber',
  '오류': 'bg-destructive/15 text-destructive',
  // Proxy
  '정상': 'bg-emerald/15 text-emerald',
  '느림': 'bg-amber/15 text-amber',
  // Generic
  active: 'bg-emerald/15 text-emerald',
  inactive: 'bg-muted text-muted-foreground',
}

export default function StatusBadge({
  label,
  className = '',
}: {
  label: string
  className?: string
}) {
  const style = presets[label] || 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${style} ${className}`}>
      {label}
    </span>
  )
}
