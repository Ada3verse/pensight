import { useEffect, useState } from 'react'
import { subscribeToasts } from '../utils/notify'
import './ToastHost.css'

const TOAST_DURATION_MS = 6000

function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(
    () =>
      subscribeToasts((message) => {
        const id = `${Date.now()}-${Math.random()}`
        setToasts((prev) => [...prev, { id, message }])
        setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS)
      }),
    [],
  )

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <span>✓ {toast.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="알림 닫기"
            onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastHost
