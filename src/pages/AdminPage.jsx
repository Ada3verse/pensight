import { useCallback, useEffect, useState } from 'react'
import {
  ADMIN_TOKEN_KEY,
  deleteNicknameAndDocuments,
  getAllDocuments,
  getNicknameStats,
  getRecentErrors,
  createSharedReference,
  deleteSharedReference,
  listSharedReferences,
  getTodayUsage,
  resetNicknamePin,
} from '../utils/firestoreService'
import { prepareReferenceUpload, SHARED_CATEGORIES } from '../utils/referenceService'
import './AdminPage.css'

const MODE_LABELS = {
  quick: '빠른 OCR',
  ai: 'AI 분석',
}

// 관리자 PIN은 서버(netlify/functions/admin-auth.js)에서 입력값을 SHA-256으로 해시한 뒤
// process.env.ADMIN_PIN(해시값)과 비교합니다. Netlify 환경변수에는 평문 PIN이 아니라
// 해시값을, VITE_ 접두사 없이 ADMIN_PIN으로 등록해야 합니다 — VITE_ 접두사가 붙으면
// 빌드 시 클라이언트 번들에 노출됩니다.
const ADMIN_AUTH_URL = '/.netlify/functions/admin-auth'
const MAX_ATTEMPTS = 5
const LOCK_DURATION_MS = 30000

const TABS = [
  { id: 'stats', label: '전체 사용 현황' },
  { id: 'documents', label: '전체 문서 목록' },
  { id: 'errors', label: '에러 현황' },
  { id: 'nicknames', label: '닉네임 관리' },
  { id: 'manual', label: '매뉴얼 관리' },
]

function formatDate(timestamp) {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : null
  if (!date) return ''
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isToday(timestamp) {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : null
  if (!date) return false
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function PinScreen({ onSuccess }) {
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handlePinChange = (event) => {
    setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (locked || submitting) return

    setSubmitting(true)
    setErrorMessage('')
    try {
      const response = await fetch(ADMIN_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await response.json().catch(() => null)

      if (response.ok && data?.success) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token)
        onSuccess()
        return
      }

      const nextAttempts = attempts + 1
      setPin('')

      if (nextAttempts >= MAX_ATTEMPTS) {
        setAttempts(nextAttempts)
        setLocked(true)
        setErrorMessage('잠시 후 다시 시도해주세요.')
        setTimeout(() => {
          setLocked(false)
          setAttempts(0)
          setErrorMessage('')
        }, LOCK_DURATION_MS)
      } else {
        setAttempts(nextAttempts)
        setErrorMessage(
          `PIN이 올바르지 않습니다. (남은 시도: ${MAX_ATTEMPTS - nextAttempts}회)`,
        )
      }
    } catch {
      setPin('')
      setErrorMessage('인증 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-pin-screen">
      <form className="admin-pin-form" onSubmit={handleSubmit}>
        <h1>PenSight 관리자</h1>
        <p className="admin-pin-hint">관리자 PIN 4자리를 입력하세요.</p>
        <input
          type="password"
          inputMode="numeric"
          className="admin-pin-input"
          value={pin}
          onChange={handlePinChange}
          maxLength={4}
          disabled={locked || submitting}
          autoFocus
        />
        {errorMessage && <p className="admin-pin-error">{errorMessage}</p>}
        <button
          type="submit"
          className="admin-pin-submit"
          disabled={locked || submitting || pin.length !== 4}
        >
          확인
        </button>
      </form>
    </div>
  )
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState(
    () => Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY)),
  )
  const [activeTab, setActiveTab] = useState('stats')
  const [documents, setDocuments] = useState([])
  const [nicknameStats, setNicknameStats] = useState([])
  const [usage, setUsage] = useState(null)
  const [errorReport, setErrorReport] = useState(null)
  const [manuals, setManuals] = useState([])
  const [manualCategory, setManualCategory] = useState(SHARED_CATEGORIES[0].id)
  const [manualUploading, setManualUploading] = useState(false)
  const [manualMessage, setManualMessage] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [resettingNickname, setResettingNickname] = useState('')
  const [deletingNickname, setDeletingNickname] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [docs, stats, todayUsage, errors, sharedReferences] = await Promise.all([
        getAllDocuments(),
        getNicknameStats(),
        getTodayUsage(),
        getRecentErrors(),
        listSharedReferences(),
      ])
      setDocuments(docs)
      setNicknameStats(stats)
      setUsage(todayUsage)
      setErrorReport(errors)
      setManuals(sharedReferences)
    } catch {
      setLoadError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    loadData()
  }, [authenticated, loadData])

  const handleResetPin = async (nickname) => {
    if (!window.confirm('정말 PIN을 초기화하시겠습니까?')) return
    setResettingNickname(nickname)
    try {
      await resetNicknamePin(nickname)
      window.alert('PIN이 초기화되었습니다.')
    } catch {
      window.alert('PIN 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setResettingNickname('')
    }
  }

  const handleDeleteNickname = async (nickname) => {
    if (!window.confirm('이 닉네임의 모든 문서가 함께 삭제됩니다. 정말 삭제하시겠습니까?')) {
      return
    }
    setDeletingNickname(nickname)
    try {
      await deleteNicknameAndDocuments(nickname)
      window.alert('닉네임과 문서가 삭제되었습니다.')
      await loadData()
    } catch {
      window.alert('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setDeletingNickname('')
    }
  }

  const handleManualUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setManualUploading(true)
    setManualMessage({ type: '', text: '' })
    try {
      await createSharedReference(manualCategory, await prepareReferenceUpload(file))
      setManualMessage({ type: 'success', text: `'${file.name}'을(를) 등록했습니다.` })
      setManuals(await listSharedReferences())
    } catch (err) {
      setManualMessage({ type: 'error', text: err.message })
    } finally {
      setManualUploading(false)
    }
  }

  const handleManualDelete = async (item) => {
    if (!window.confirm(`'${item.fileName}' 매뉴얼을 삭제하시겠습니까? 모든 교사의 AI 분석에서 제외됩니다.`)) return
    try {
      await deleteSharedReference(item.id)
      setManuals((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch (err) {
      setManualMessage({ type: 'error', text: err.message })
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    setAuthenticated(false)
    setActiveTab('stats')
    setDocuments([])
    setNicknameStats([])
  }

  if (!authenticated) {
    return <PinScreen onSuccess={() => setAuthenticated(true)} />
  }

  const totalDocuments = documents.length
  const todayDocuments = documents.filter((docItem) => isToday(docItem.createdAt)).length

  return (
    <div className="admin">
      <header className="admin-header">
        <span className="admin-logo">PenSight 관리자</span>
        <button type="button" className="admin-logout-button" onClick={handleLogout}>
          로그아웃
        </button>
      </header>

      {errorReport && errorReport.lastHourCount >= errorReport.threshold && (
        <div className="admin-alert-banner" role="alert">
          ⚠️ 최근 1시간 동안 에러가 {errorReport.lastHourCount}건 발생했습니다. "에러 현황" 탭에서 확인해주세요.
        </div>
      )}

      <nav className="admin-tabs">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="admin-main">
        {loading ? (
          <p className="admin-status">불러오는 중...</p>
        ) : loadError ? (
          <p className="admin-status error">{loadError}</p>
        ) : (
          <>
            {activeTab === 'stats' && (
              <section className="admin-section">
                <div className="admin-stat-grid">
                  <div className="admin-stat-card">
                    <span className="admin-stat-label">총 문서 수</span>
                    <span className="admin-stat-value">{totalDocuments}</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="admin-stat-label">오늘 업로드된 문서 수</span>
                    <span className="admin-stat-value">{todayDocuments}</span>
                  </div>
                </div>

                {usage && (
                  <>
                    <h2>오늘 API 사용량 ({usage.date})</h2>
                    <div className="admin-stat-grid">
                      <div className="admin-stat-card">
                        <span className="admin-stat-label">Vision API (OCR) 총 사용횟수</span>
                        <span className="admin-stat-value">
                          {usage.total.vision} / {usage.limits.total.vision}
                        </span>
                      </div>
                      <div className="admin-stat-card">
                        <span className="admin-stat-label">Claude API 총 사용횟수</span>
                        <span className="admin-stat-value">
                          {usage.total.claude} / {usage.limits.total.claude}
                        </span>
                      </div>
                    </div>

                    <h2>닉네임별 오늘 사용량</h2>
                    {usage.users.length === 0 ? (
                      <p className="admin-status">오늘 사용 기록이 없습니다.</p>
                    ) : (
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>닉네임</th>
                            <th>OCR ({usage.limits.user.vision})</th>
                            <th>AI 분석 ({usage.limits.user.ai})</th>
                            <th>세특 생성 ({usage.limits.user.sespec})</th>
                            <th>마스킹 ({usage.limits.user.mask})</th>
                            <th>상담 추천 ({usage.limits.user.counsel})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usage.users.map((row) => (
                            <tr key={row.nickname}>
                              <td>{row.nickname}</td>
                              <td>{row.vision}</td>
                              <td>{row.ai}</td>
                              <td>{row.sespec}</td>
                              <td>{row.mask}</td>
                              <td>{row.counsel}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                <h2>닉네임별 문서 수</h2>
                <ul className="admin-list">
                  {nicknameStats.map((stat) => (
                    <li className="admin-list-row" key={stat.nickname}>
                      <span>{stat.nickname}</span>
                      <span className="admin-list-count">{stat.count}건</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {activeTab === 'errors' && errorReport && (
              <section className="admin-section">
                <p className="admin-error-summary">
                  최근 1시간 {errorReport.lastHourCount}건 · 최근 {errorReport.errors.length}건 표시
                </p>
                {errorReport.errors.length === 0 ? (
                  <p className="admin-status">기록된 에러가 없습니다.</p>
                ) : (
                  <ul className="admin-error-list">
                    {errorReport.errors.map((item) => (
                      <li className="admin-error-item" key={item.id}>
                        <details>
                          <summary>
                            <span className="admin-error-time">{formatDate(item.createdAt)}</span>
                            <span className={`admin-error-source ${item.source}`}>
                              {item.source === 'server' ? '서버' : '프론트'}
                            </span>
                            <span className="admin-error-name">{item.name || '-'}</span>
                            <span className="admin-error-nickname">{item.nickname || '비로그인'}</span>
                            <span className="admin-error-message">{item.message}</span>
                          </summary>
                          <dl className="admin-error-detail">
                            {item.path && (
                              <>
                                <dt>요청 경로</dt>
                                <dd>{item.path}</dd>
                              </>
                            )}
                            {(item.page || item.step) && (
                              <>
                                <dt>페이지/단계</dt>
                                <dd>{[item.page, item.step].filter(Boolean).join(' · ')}</dd>
                              </>
                            )}
                            {item.stack && (
                              <>
                                <dt>스택 트레이스</dt>
                                <dd>
                                  <pre>{item.stack}</pre>
                                </dd>
                              </>
                            )}
                          </dl>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeTab === 'documents' && (
              <section className="admin-section">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>닉네임</th>
                      <th>파일명</th>
                      <th>모드</th>
                      <th>저장 날짜</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((docItem) => (
                      <tr
                        key={docItem.id}
                        className="admin-table-row"
                        onClick={() => setSelectedDoc(docItem)}
                      >
                        <td>{docItem.nickname}</td>
                        <td>{docItem.fileName || '파일명 없음'}</td>
                        <td>{MODE_LABELS[docItem.mode] ?? docItem.mode}</td>
                        <td>{formatDate(docItem.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {activeTab === 'nicknames' && (
              <section className="admin-section">
                <ul className="admin-list">
                  {nicknameStats.map((stat) => {
                    const isResetting = resettingNickname === stat.nickname
                    const isDeleting = deletingNickname === stat.nickname
                    const rowBusy = isResetting || isDeleting
                    return (
                      <li className="admin-list-row" key={stat.nickname}>
                        <span>{stat.nickname}</span>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="admin-reset-button"
                            onClick={() => handleResetPin(stat.nickname)}
                            disabled={rowBusy}
                          >
                            {isResetting ? '초기화 중...' : 'PIN 초기화'}
                          </button>
                          <button
                            type="button"
                            className="admin-delete-button"
                            onClick={() => handleDeleteNickname(stat.nickname)}
                            disabled={rowBusy}
                          >
                            {isDeleting ? '삭제 중...' : '닉네임 삭제'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {activeTab === 'manual' && (
              <section className="admin-section">
                <p className="admin-manual-desc">
                  여기에 올린 자료는 모든 교사의 AI 분석에 적용됩니다. 학폭 매뉴얼은 학교폭력 문서,
                  진로 상담 매뉴얼은 진로 문서, 기타 공통 자료는 일반 문서 분석에 참고됩니다.
                  텍스트가 있는 PDF·TXT만 지원하며(스캔본 불가) 최대 4MB, 50개까지 등록할 수 있습니다.
                </p>
                <div className="admin-manual-form">
                  <select
                    className="admin-manual-select"
                    value={manualCategory}
                    onChange={(event) => setManualCategory(event.target.value)}
                    aria-label="자료 종류"
                  >
                    {SHARED_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <label className={`admin-upload-button ${manualUploading ? 'disabled' : ''}`}>
                    {manualUploading ? '올리는 중...' : 'PDF·TXT 올리기'}
                    <input
                      type="file"
                      className="admin-manual-input"
                      accept=".pdf,.txt,application/pdf,text/plain"
                      onChange={handleManualUpload}
                      disabled={manualUploading}
                    />
                  </label>
                </div>
                {manualMessage.text && (
                  <p className={`admin-manual-message ${manualMessage.type}`} role="status">
                    {manualMessage.text}
                  </p>
                )}
                {manuals.length === 0 ? (
                  <p className="admin-status">등록된 매뉴얼이 없습니다.</p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>종류</th>
                        <th>파일명</th>
                        <th>업로드 일시</th>
                        <th>분량</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {manuals.map((item) => (
                        <tr key={item.id}>
                          <td>{item.categoryLabel}</td>
                          <td>{item.fileName}</td>
                          <td>{formatDate(item.createdAt)}</td>
                          <td>{item.charCount.toLocaleString()}자</td>
                          <td>
                            <button
                              type="button"
                              className="admin-manual-delete"
                              onClick={() => handleManualDelete(item)}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {selectedDoc && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedDoc(null)}>
          <div className="admin-modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-mode-badge">
                  {MODE_LABELS[selectedDoc.mode] ?? selectedDoc.mode}
                </span>
                <h2>{selectedDoc.fileName || '파일명 없음'}</h2>
                <p className="admin-modal-meta">
                  {selectedDoc.nickname}님 · {formatDate(selectedDoc.createdAt)}
                </p>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedDoc(null)}
              >
                ×
              </button>
            </div>
            <textarea
              className="admin-modal-textarea"
              value={selectedDoc.extractedText ?? ''}
              readOnly
            />
            {selectedDoc.aiSummary && (
              <div className="admin-modal-summary">
                <h3>AI 요약·추천</h3>
                <p>{selectedDoc.aiSummary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPage
