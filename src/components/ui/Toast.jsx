import { CheckCircle2, XCircle, Lightbulb, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store/index.js'

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  info:    Lightbulb,
  warning: AlertTriangle,
}
const COLORS = {
  success: '#D8FAF0',
  error:   '#FFEAEA',
  info:    '#EDE3FF',
  warning: '#FFF0DC',
}
const ICON_COLORS = {
  success: '#1B8A5E',
  error:   '#C03030',
  info:    '#7B2FD4',
  warning: '#C0640A',
}

export default function ToastArea() {
  const { toasts, dismissToast } = useStore()

  return (
    <div className="toast-area">
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || Lightbulb
        return (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismissToast(t.id)}>
            <div
              className="toast-icon"
              style={{ background: COLORS[t.type] || '#EDE3FF', color: ICON_COLORS[t.type] }}
            >
              <Icon size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: '.86rem' }}>{t.message}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
