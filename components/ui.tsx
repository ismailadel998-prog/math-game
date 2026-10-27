'use client'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { CAR_COLORS } from '@/lib/shared'

export function Button({ children, onClick, kind = 'primary', disabled = false, type = 'button', className = '' }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean; type?: 'button' | 'submit'; className?: string
}) {
  return <button type={type} className={`btn btn-${kind} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>
}

export function Car({ color, small = false, label }: { color: string; small?: boolean; label?: string }) {
  return (
    <div className={`car ${small ? 'car-small' : ''}`} style={{ '--car': color } as CSSProperties} role="img" aria-label={label ?? 'race car'}>
      <div className="car-wing" /><div className="car-body"><div className="car-window" /><div className="car-stripe" /></div>
      <div className="wheel wheel-a" /><div className="wheel wheel-b" />
    </div>
  )
}

export const carColor = (i: number) => CAR_COLORS[i] ?? CAR_COLORS[0]

export function Logo() {
  return <div className="logo"><span className="flag" aria-hidden>▦</span><div><b>MULTIPLICATION</b><strong>RACE</strong></div></div>
}

export function Header({ code, right }: { code?: string; right?: ReactNode }) {
  return (
    <header>
      <Link href="/" aria-label="Multiplication Race home" style={{ textDecoration: 'none', color: 'inherit' }}><Logo /></Link>
      {code && <div className="room-pill"><span>ROOM CODE</span><b>{code}</b></div>}
      <div>{right}</div>
    </header>
  )
}

export function Field({ value, onChange, placeholder, answer = false, onEnter, disabled, maxLength, className = '', label, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; answer?: boolean; onEnter?: () => void
  disabled?: boolean; maxLength?: number; className?: string; label?: string; autoFocus?: boolean
}) {
  return (
    <input
      className={`${answer ? 'answer-field' : 'text-field'} ${className}`}
      value={value} disabled={disabled} maxLength={maxLength} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
      placeholder={placeholder} inputMode={answer ? 'numeric' : 'text'} autoComplete="off" autoCapitalize="off" spellCheck={false}
      aria-label={label ?? placeholder ?? 'Answer'}
    />
  )
}

export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2><p>{body}</p>
        <div className="row"><Button kind="secondary" onClick={onCancel}>Cancel</Button><Button kind="danger" onClick={onConfirm}>{confirmLabel}</Button></div>
      </div>
    </div>
  )
}
