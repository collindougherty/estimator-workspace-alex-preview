import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type FloatingPanelProps = {
  actions?: ReactNode
  children: ReactNode
  className?: string
  onClose: () => void
  size?: 'compact' | 'wide'
  subtitle?: string
  title: string
}

export const FloatingPanel = ({
  actions,
  children,
  className,
  onClose,
  size = 'wide',
  subtitle,
  title,
}: FloatingPanelProps) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      aria-modal="true"
      className="floating-panel-backdrop"
      onClick={onClose}
      role="dialog"
    >
      <div
        className={'floating-panel floating-panel-' + size + (className ? ' ' + className : '')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="floating-panel-header">
          <div className="floating-panel-copy">
            <p className="eyebrow">ProfitBuilder</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="floating-panel-actions">
            {actions}
            <button className="ghost-button floating-panel-close" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </header>
        <div className="floating-panel-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
