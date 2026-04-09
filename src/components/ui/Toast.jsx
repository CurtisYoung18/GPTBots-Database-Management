import { useStore } from '../../store/index.js'

export default function ToastArea() {
  const { toasts, dismissToast } = useStore()

  const icons = { success: '✅', error: '❌', info: '💡', warning: '⚠️' }

  return (
    <div className="toast-area">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type}`}
          onClick={() => dismissToast(t.id)}
        >
          <div className="toast-icon">{icons[t.type] || '💡'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: '.86rem' }}>{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
