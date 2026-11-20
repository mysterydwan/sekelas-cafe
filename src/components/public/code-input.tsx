'use client'

// Order-code input: auto-uppercase, live SKC-XXX validation, Enter submits.
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n'
import { ORDER_CODE_RE, normalizeOrderCode } from './utils'

export function CodeInput({
  value,
  onChange,
  onSubmit,
  autoFocus,
  id,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit?: () => void
  autoFocus?: boolean
  id?: string
  'aria-label'?: string
}) {
  const { t } = useI18n()
  const valid = ORDER_CODE_RE.test(value)

  return (
    <div className="space-y-1.5">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(normalizeOrderCode(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid && onSubmit) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder="SKC-012"
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        aria-label={ariaLabel ?? t('track.codeLabel')}
        aria-invalid={value.length > 0 && !valid}
        className="h-12 rounded-xl border-border bg-background text-center font-mono text-lg font-semibold uppercase tracking-[0.15em]"
      />
      {value.length > 0 && !valid && (
        <p className="text-xs text-destructive" role="alert">
          {t('track.codeFormatHint')}
        </p>
      )}
    </div>
  )
}
