import { useEffect, useState } from 'react'
import './ProcessSteps.css'

// 처리 단계 인디케이터.
// - steps: 단계 이름 배열, current: 현재 단계 인덱스
// - state: running(스피너) / waiting(사용자 조작 대기) / error(빨간 X) / complete(전 단계 체크)
// - fileProgress: 다중 파일 처리 시 { total, index(0부터, 처리 중인 파일) } → "N개 파일 중 K번째 처리 중..." + 진행률 바
// - percent: 진행률 바를 직접 지정할 때(0~100), indeterminate: 진행 정도를 알 수 없는 구간
// - error: { message, retryLabel, onRetry }
function ProcessSteps({
  steps,
  current,
  state = 'running',
  hint,
  detail,
  fileProgress,
  percent,
  indeterminate = false,
  error,
}) {
  const [elapsed, setElapsed] = useState(0)
  const running = state === 'running'

  useEffect(() => {
    if (!running) return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [running, current])

  const statusOf = (index) => {
    if (state === 'complete') return 'done'
    if (index < current) return 'done'
    if (index === current) return state
    return 'pending'
  }

  const barPercent =
    percent ?? (fileProgress ? Math.round((fileProgress.index / fileProgress.total) * 100) : null)
  const showBar = barPercent !== null || indeterminate

  return (
    <div className="process-steps">
      <ol className="process-steps-list">
        {steps.map((label, index) => {
          const status = statusOf(index)
          return (
            <li className={`process-step ${status}`} key={label} aria-current={index === current ? 'step' : undefined}>
              <span className="process-step-icon" aria-hidden="true">
                {status === 'done' && '✓'}
                {status === 'error' && '✕'}
                {status === 'running' && <span className="process-step-spinner" />}
                {status === 'waiting' && <span className="process-step-dot" />}
                {status === 'pending' && index + 1}
              </span>
              <span className="process-step-label">{label}</span>
            </li>
          )
        })}
      </ol>

      {showBar && (
        <div
          className="process-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : barPercent}
        >
          <div
            className={`process-bar-fill ${indeterminate ? 'indeterminate' : ''}`}
            style={indeterminate ? undefined : { width: `${barPercent}%` }}
          />
        </div>
      )}

      <div className="process-steps-info" role="status" aria-live="polite">
        {fileProgress && running && (
          <p className="process-steps-file">
            {fileProgress.total}개 파일 중 {Math.min(fileProgress.index + 1, fileProgress.total)}번째 처리 중...
            {barPercent !== null && ` (${barPercent}%)`}
          </p>
        )}
        {detail && <p className="process-steps-detail">{detail}</p>}
        {running && hint && (
          <p className="process-steps-hint">
            {hint} · 경과 {elapsed}초
          </p>
        )}
      </div>

      {state === 'error' && error && (
        <div className="process-steps-error">
          <span>{error.message}</span>
          {error.onRetry && (
            <button type="button" className="process-steps-retry" onClick={error.onRetry}>
              {error.retryLabel ?? '다시 시도'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ProcessSteps
