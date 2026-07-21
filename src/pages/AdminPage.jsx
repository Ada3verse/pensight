import { useCallback, useEffect, useState } from 'react'
import {
  ADMIN_TOKEN_KEY,
  deleteNicknameAndDocuments,
  getAllDocuments,
  getNicknameStats,
  resetNicknamePin,
} from '../utils/firestoreService'
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
  { id: 'nicknames', label: '닉네임 관리' },
  { id: 'manual', label: '공용 DB 매뉴얼' },
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [resettingNickname, setResettingNickname] = useState('')
  const [deletingNickname, setDeletingNickname] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [docs, stats] = await Promise.all([getAllDocuments(), getNicknameStats()])
      setDocuments(docs)
      setNicknameStats(stats)
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
                <div className="admin-upload-area">
                  <p className="admin-upload-title">공용 DB 매뉴얼 파일을 끌어다 놓으세요</p>
                  <p className="admin-upload-hint">2차 기능으로 추후 제공됩니다.</p>
                  <input type="file" className="admin-upload-input" disabled />
                </div>
                <button type="button" className="admin-upload-button" disabled>
                  준비 중
                </button>
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
