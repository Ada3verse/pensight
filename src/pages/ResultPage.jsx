import { useEffect, useState } from 'react'
import { extractTextFromFile, OcrError } from '../utils/ocrService'
import { analyzeDocument, AiError } from '../utils/aiService'
import { maskPersonalInfo } from '../utils/maskingService'
import { saveDocument, updateDocument } from '../utils/firestoreService'
import { formatAiSummary } from '../utils/textFormat'
import './ResultPage.css'

const MODE_LABELS = {
  ocr: '빠른 OCR',
  ai: 'AI 분석',
}

const MODE_TO_FIRESTORE = {
  ocr: 'quick',
  ai: 'ai',
}

const SAVE_TIMEOUT_MS = 8000

const SAVE_BUTTON_LABELS = {
  idle: '저장',
  saving: '저장 중...',
  success: '✓ 저장완료',
  error: '저장 실패',
}

const STAGE_MESSAGES = [
  '이미지 전처리 중...',
  'OCR 분석 중...',
  '개인정보 마스킹 중...',
  '완료',
]

const MASKING_NOTICE_MESSAGES = {
  success: '개인정보가 자동으로 마스킹되었습니다. 내용을 확인하고 필요시 직접 수정해주세요.',
  error: '개인정보 자동 마스킹에 실패했습니다. 업로드 전 민감 정보를 직접 확인하고 수정해주세요.',
}

const DEFAULT_ERROR_MESSAGE =
  'OCR 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

const DEFAULT_AI_ERROR_MESSAGE =
  'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw new Error('timeout')
    }),
  ])
}

function ResultPage({ files = [], nickname, mode, onBack }) {
  const file = files[0]
  const isImage = file?.type.startsWith('image/')

  const [previewUrl, setPreviewUrl] = useState(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('processing')
  const [ocrText, setOcrText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [maskingNotice, setMaskingNotice] = useState(null)
  const [aiStatus, setAiStatus] = useState('idle')
  const [aiSummary, setAiSummary] = useState('')
  const [aiError, setAiError] = useState('')
  const [copyLabel, setCopyLabel] = useState('전체 복사')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [docId, setDocId] = useState(null)

  useEffect(() => {
    if (!file) {
      setOcrStatus('error')
      setErrorMessage('업로드된 파일이 없습니다.')
      return
    }

    let cancelled = false
    async function runOcr() {
      try {
        setOcrStatus('processing')
        setStageIndex(0)
        await delay(300)
        if (cancelled) return
        setStageIndex(1)
        const text = await extractTextFromFile(file)
        if (cancelled) return
        setStageIndex(2)
        const maskingResult = await maskPersonalInfo(text)
        if (cancelled) return
        setOcrText(maskingResult.text)
        setStageIndex(3)
        await delay(400)
        if (cancelled) return
        setOcrStatus('done')
        setMaskingNotice(maskingResult.success ? 'success' : 'error')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof OcrError ? err.message : DEFAULT_ERROR_MESSAGE)
        setOcrStatus('error')
      }
    }
    runOcr()
    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    if (mode !== 'ai' || ocrStatus !== 'done' || aiStatus !== 'idle') return
    setAiStatus('loading')
  }, [mode, ocrStatus, aiStatus])

  useEffect(() => {
    if (aiStatus !== 'loading') return
    let cancelled = false
    async function runAnalysis() {
      try {
        const summary = await analyzeDocument(ocrText, MODE_TO_FIRESTORE[mode] ?? mode)
        if (cancelled) return
        setAiSummary(summary)
        setAiStatus('done')
        if (docId) {
          updateDocument(docId, { aiSummary: summary }).catch(() => {})
        }
      } catch (err) {
        if (cancelled) return
        setAiError(err instanceof AiError ? err.message : DEFAULT_AI_ERROR_MESSAGE)
        setAiStatus('error')
      }
    }
    runAnalysis()
    return () => {
      cancelled = true
    }
  }, [aiStatus, ocrText, mode, docId])

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ocrText)
      setCopyLabel('복사됨')
    } catch {
      setCopyLabel('복사 실패')
    }
    setTimeout(() => setCopyLabel('전체 복사'), 1500)
  }

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      const id = await withTimeout(
        saveDocument(nickname, MODE_TO_FIRESTORE[mode] ?? mode, file?.name ?? '', ocrText),
        SAVE_TIMEOUT_MS,
      )
      setDocId(id)
      setSaveStatus('success')
    } catch {
      setSaveStatus('error')
    }
  }

  const handleTextChange = (event) => {
    setOcrText(event.target.value)
    setSaveStatus((prev) => (prev === 'success' || prev === 'error' ? 'idle' : prev))
  }

  const handleStartAi = () => {
    setAiStatus('loading')
  }

  return (
    <div className="result">
      <header className="result-header">
        <div className="result-header-info">
          <span className="mode-badge">{MODE_LABELS[mode] ?? MODE_LABELS.ocr}</span>
          <span className="nickname-badge">{nickname}님</span>
        </div>
      </header>

      {maskingNotice && (
        <div className={`masking-notice ${maskingNotice}`}>
          <span>{MASKING_NOTICE_MESSAGES[maskingNotice]}</span>
          <button
            type="button"
            className="masking-notice-close"
            onClick={() => setMaskingNotice(null)}
            aria-label="안내 닫기"
          >
            ×
          </button>
        </div>
      )}

      <main className="result-main">
        <section className="result-preview">
          <div className="preview-frame">
            {file ? (
              isImage ? (
                <img className="preview-image" src={previewUrl} alt={file.name} />
              ) : (
                <div className="preview-pdf">
                  <span className="preview-pdf-icon">PDF</span>
                  <span className="preview-pdf-name">{file.name}</span>
                </div>
              )
            ) : (
              <p className="preview-empty">업로드된 파일이 없습니다.</p>
            )}
          </div>
          <button type="button" className="back-button" onClick={onBack}>
            ← 다시 업로드
          </button>
        </section>

        <section className="result-text">
          <div className="result-text-header">
            <h2>추출된 텍스트</h2>
            <div className="result-text-actions">
              <button
                type="button"
                className="text-action-button"
                onClick={handleCopy}
                disabled={ocrStatus !== 'done'}
              >
                {copyLabel}
              </button>
              <button
                type="button"
                className={`save-button ${saveStatus}`}
                onClick={handleSave}
                disabled={
                  ocrStatus !== 'done' ||
                  saveStatus === 'saving' ||
                  saveStatus === 'success'
                }
              >
                {SAVE_BUTTON_LABELS[saveStatus]}
              </button>
            </div>
          </div>

          {ocrStatus === 'error' ? (
            <div className="ocr-error">{errorMessage}</div>
          ) : ocrStatus !== 'done' ? (
            <div className="stage-progress">
              {STAGE_MESSAGES.map((stage, index) => (
                <span
                  key={stage}
                  className={`stage-item ${index === stageIndex ? 'active' : ''} ${index < stageIndex ? 'complete' : ''}`}
                >
                  {stage}
                  {index < STAGE_MESSAGES.length - 1 && (
                    <span className="stage-arrow">→</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <textarea
              className="ocr-textarea"
              value={ocrText}
              onChange={handleTextChange}
            />
          )}

          <div className="ai-section">
            {mode === 'ocr' && aiStatus === 'idle' && (
              <button
                type="button"
                className="ai-start-button"
                onClick={handleStartAi}
                disabled={ocrStatus !== 'done'}
              >
                AI 분석 시작
              </button>
            )}
            {aiStatus === 'loading' && (
              <p className="ai-loading">AI가 내용을 분석하고 있습니다...</p>
            )}
            {aiStatus === 'error' && <div className="ai-error">{aiError}</div>}
            {aiStatus === 'done' && (
              <div className="ai-summary">
                <h3>AI 요약·추천</h3>
                <p dangerouslySetInnerHTML={{ __html: formatAiSummary(aiSummary) }} />
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default ResultPage
