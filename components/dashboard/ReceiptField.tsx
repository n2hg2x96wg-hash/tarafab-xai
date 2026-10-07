'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { IconCheck, IconClose, IconFile } from '@/components/Icons'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, prettySize } from '@/lib/uploadFile'

const ACCEPT = ALLOWED_UPLOAD_TYPES.join(',')

// File picker with a preview of the chosen file, used for deposit receipts and
// for identity documents. The same validation the server applies is checked
// here too, so a client sees the problem before uploading rather than after.
export function ReceiptField({ file, onChange, disabled, id = 'receipt', label, help, choose, removeLabel }: {
  file: File | null
  onChange: (f: File | null) => void
  disabled?: boolean
  id?: string
  label?: string
  help?: string
  choose?: string
  removeLabel?: string
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  // Object URLs are released when the file changes or the form unmounts.
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Images are scaled down before upload, so only other files can be too big.
  const tooBig = !!file && !file.type.startsWith('image/') && file.size > MAX_UPLOAD_BYTES
  const wrongType = !!file && !ACCEPT.split(',').includes(file.type)

  const clear = () => {
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <span className="field-label">{label ?? t('deposit.receipt')}</span>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={e => onChange(e.target.files?.[0] || null)}
      />

      {!file ? (
        <label
          htmlFor={id}
          className={`flex flex-col items-center justify-center gap-2 min-h-[104px] px-4 py-5 rounded-xl border border-dashed border-ink-600 bg-ink-950/40 text-center transition-colors ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-ink-500 hover:bg-ink-850/60'}`}
        >
          <IconFile width={20} height={20} className="text-fg-faint" aria-hidden="true" />
          <span className="text-[14px] font-medium text-fg">{choose ?? t('deposit.chooseFile')}</span>
          <span className="text-xs text-fg-faint">{help ?? t('deposit.receiptHelp')}</span>
        </label>
      ) : (
        <div className={`flex items-center gap-2 p-3 rounded-xl border bg-ink-950/40 ${tooBig || wrongType ? 'border-danger-400/50' : 'border-ink-700'}`}>
          <span className="shrink-0 w-12 h-12 rounded-md overflow-hidden border border-ink-700 bg-ink-850 flex items-center justify-center">
            {preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt={t('deposit.preview')} className="w-full h-full object-cover" />
              : <IconFile width={18} height={18} className="text-fg-faint" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-fg truncate">{file.name}</span>
            <span className="block text-xs text-fg-faint">
              {prettySize(file.size)}
              {tooBig ? ` · ${t('deposit.errSize')}` : wrongType ? ` · ${t('deposit.errType')}` : ''}
            </span>
          </span>
          {!tooBig && !wrongType && <IconCheck width={16} height={16} className="shrink-0 text-emerald-400" aria-hidden="true" />}
          {/* Replace re-opens the same file picker (same input, same checks). */}
          {!disabled && <label htmlFor={id} className="shrink-0 cursor-pointer rounded-md px-2 h-9 inline-flex items-center text-[12.5px] text-fg-muted hover:text-fg hover:bg-ink-800 transition-colors">Replace</label>}
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={removeLabel ?? t('deposit.removeFile')}
            className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-fg-faint hover:text-fg hover:bg-ink-800 transition-colors disabled:opacity-50"
          >
            <IconClose width={16} height={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
