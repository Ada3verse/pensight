// 처리 완료 알림: 브라우저 알림 권한이 있으면 Notification API로, 없으면 화면 상단 토스트로 알린다.

const toastListeners = new Set()

export function subscribeToasts(listener) {
  toastListeners.add(listener)
  return () => toastListeners.delete(listener)
}

export function showToast(message) {
  toastListeners.forEach((listener) => listener(message))
}

// 사용자 클릭(분석·생성 시작) 직후에 호출한다. 이미 허용/거부된 경우에는 아무것도 하지 않는다.
export function requestNotificationPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  try {
    Promise.resolve(Notification.requestPermission()).catch(() => {})
  } catch {
    // 일부 브라우저는 Promise 없이 콜백만 지원하거나 요청 자체를 막는다. 토스트로 대체되므로 무시한다.
  }
}

export function notifyComplete(message) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('PenSight', { body: message })
      return
    } catch {
      // 생성자를 쓸 수 없는 환경(일부 모바일 브라우저)은 토스트로 대체한다.
    }
  }
  showToast(message)
}
