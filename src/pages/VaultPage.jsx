import { useEffect, useState } from 'react'
import { deleteDocument, getDocuments, updateDocument } from '../utils/firestoreService'
import { analyzeDocument, AiError } from '../utils/aiService'
import { formatAiSummary } from '../utils/textFormat'
import './VaultPage.css'

const MODE_LABELS = {
  quick: '빠른 OCR',
  ai: 'AI 분석',
}

const PREVIEW_LENGTH = 50

const DEFAULT_AI_ERROR_MESSAGE =
  'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

function formatDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : null
  if (!date) return ''
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? `${text.slice(0, length)}...` : text
}

function VaultPage({ nickname, onBack }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [copyLabel, setCopyLabel] = useState('전체 복사')
  const [aiStatus, setAiStatus] = useState('idle')
  const [aiSummaryText, setAiSummaryText] = useState('')
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadDocuments() {
      setLoading(true)
      setLoadError('')
      try {
        const docs = await getDocuments(nickname)
        if (cancelled) return
        setDocuments(docs)
      } catch {
        if (cancelled) return
        setLoadError('문서를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadDocuments()
    return () => {
      cancelled = true
    }
  }, [nickname])

  const openDoc = (docItem) => {
    setSelectedDoc(docItem)
    setCopyLabel('전체 복사')
    setAiError('')
    if (docItem.aiSummary) {
      setAiSummaryText(docItem.aiSummary)
      setAiStatus('done')
    } else {
      setAiSummaryText('')
      setAiStatus('idle')
    }
  }

  const closeDoc = () => setSelectedDoc(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedDoc.extractedText ?? '')
      setCopyLabel('복사됨')
    } catch {
      setCopyLabel('복사 실패')
    }
    setTimeout(() => setCopyLabel('전체 복사'), 1500)
  }

  const handleStartAi = async () => {
    setAiStatus('loading')
    setAiError('')
    try {
      const summary = await analyzeDocument(selectedDoc.extractedText ?? '', selectedDoc.mode)
      setAiSummaryText(summary)
      setAiStatus('done')
      setDocuments((prev) =>
        prev.map((docItem) =>
          docItem.id === selectedDoc.id ? { ...docItem, aiSummary: summary } : docItem,
        ),
      )
      setSelectedDoc((prev) => (prev ? { ...prev, aiSummary: summary } : prev))
      updateDocument(selectedDoc.id, { aiSummary: summary }).catch(() => {})
    } catch (err) {
      setAiError(err instanceof AiError ? err.message : DEFAULT_AI_ERROR_MESSAGE)
      setAiStatus('error')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    try {
      await deleteDocument(selectedDoc.id)
      setDocuments((prev) => prev.filter((docItem) => docItem.id !== selectedDoc.id))
      closeDoc()
    } catch {
      window.alert('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="vault">
      <header className="vault-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← 처음으로
        </button>
        <span className="nickname-badge">{nickname}님</span>
      </header>

      <main className="vault-main">
        {loading ? (
          <p className="vault-status">문서를 불러오는 중...</p>
        ) : loadError ? (
          <p className="vault-status error">{loadError}</p>
        ) : documents.length === 0 ? (
          <p className="vault-status">저장된 문서가 없습니다. 파일을 업로드해보세요.</p>
        ) : (
          <div className="document-grid">
            {documents.map((docItem) => (
              <button
                type="button"
                key={docItem.id}
                className="document-card"
                onClick={() => openDoc(docItem)}
              >
                <div className="document-card-top">
                  <span className="mode-badge">
                    {MODE_LABELS[docItem.mode] ?? docItem.mode}
                  </span>
                  <span className={`summary-badge ${docItem.aiSummary ? 'has-summary' : ''}`}>
                    {docItem.aiSummary ? '요약 있음' : '요약 없음'}
                  </span>
                </div>
                <p className="document-filename">{docItem.fileName || '파일명 없음'}</p>
                <p className="document-date">{formatDate(docItem.createdAt)}</p>
                <p className="document-preview">
                  {truncate(docItem.extractedText, PREVIEW_LENGTH)}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedDoc && (
        <div className="modal-backdrop" onClick={closeDoc}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="mode-badge">
                  {MODE_LABELS[selectedDoc.mode] ?? selectedDoc.mode}
                </span>
                <h2>{selectedDoc.fileName || '파일명 없음'}</h2>
                <p className="modal-date">{formatDate(selectedDoc.createdAt)}</p>
              </div>
              <button type="button" className="modal-close" onClick={closeDoc}>
                ×
              </button>
            </div>

            <textarea
              className="modal-textarea"
              value={selectedDoc.extractedText ?? ''}
              readOnly
            />

            {aiStatus === 'loading' && (
              <p className="ai-loading">AI가 내용을 분석하고 있습니다...</p>
            )}
            {aiStatus === 'error' && <div className="ai-error">{aiError}</div>}
            {aiStatus === 'done' && (
              <div className="ai-summary">
                <h3>AI 요약·추천</h3>
                <p dangerouslySetInnerHTML={{ __html: formatAiSummary(aiSummaryText) }} />
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="modal-button" onClick={handleCopy}>
                {copyLabel}
              </button>
              {selectedDoc.mode === 'quick' &&
                (aiStatus === 'idle' || aiStatus === 'error') && (
                  <button type="button" className="modal-button primary" onClick={handleStartAi}>
                    AI 분석 시작
                  </button>
                )}
              <button type="button" className="modal-button danger" onClick={handleDelete}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VaultPage
