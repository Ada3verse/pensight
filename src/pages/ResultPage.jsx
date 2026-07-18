import { useEffect, useState } from 'react'
import { extractTextFromFile, OcrError } from '../utils/ocrService'
import { analyzeDocument, AiError } from '../utils/aiService'
import { maskPersonalInfo } from '../utils/maskingService'
import { saveDocument, updateDocument } from '../utils/firestoreService'
import { formatAiSummary, parseAiSections } from '../utils/textFormat'
import { generatePDF, buildPdfFileName } from '../utils/pdfService'
import PdfSectionModal from '../components/PdfSectionModal'
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

function ResultPage({ files = [], nickname, mode, docType, onBack }) {
  const file = files[0]
  const isImage = file?.type.startsWith('image/')

  const [previewUrl, setPreviewUrl] = useState(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('processing')
  const [ocrText, setOcrText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [maskingNotice, setMaskingNotice] = useState(null)
  const [mappingTable, setMappingTable] = useState([])
  const [ocrProgressMessage, setOcrProgressMessage] = useState('')
  const [pageLimitNotice, setPageLimitNotice] = useState('')
  const [aiStatus, setAiStatus] = useState('idle')
  const [aiSummary, setAiSummary] = useState('')
  const [aiError, setAiError] = useState('')
  const [copyLabel, setCopyLabel] = useState('전체 복사')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [docId, setDocId] = useState(null)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfGenerating, setPdfGenerating] = useState(false)

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
        setOcrProgressMessage('')
        setPageLimitNotice('')
        await delay(300)
        if (cancelled) return
        setStageIndex(1)
        const text = await extractTextFromFile(file, {
          onProgress: (message) => {
            if (!cancelled) setOcrProgressMessage(message)
          },
          onNotice: (message) => {
            if (!cancelled) setPageLimitNotice(message)
          },
        })
        if (cancelled) return
        setOcrProgressMessage('')
        setStageIndex(2)
        const maskingResult = await maskPersonalInfo(text)
        if (cancelled) return
        setOcrText(maskingResult.maskedText)
        setMappingTable(maskingResult.mappingTable)
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
        const summary = await analyzeDocument(ocrText, MODE_TO_FIRESTORE[mode] ?? mode, docType)
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
  }, [aiStatus, ocrText, mode, docType, docId])

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

  const handlePdfConfirm = async (selectedSections) => {
    setPdfGenerating(true)
    try {
      const sections = []
      if (selectedSections.info) {
        sections.push({
          type: 'info',
          title: '문서 정보',
          items: [
            ['파일명', file?.name || '파일명 없음'],
            [
              '처리 날짜',
              new Date().toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
            ],
            ['모드', MODE_LABELS[mode] ?? MODE_LABELS.ocr],
          ],
        })
      }
      if (selectedSections.text) {
        sections.push({ type: 'text', title: '추출된 텍스트', content: ocrText })
      }
      if (selectedSections.mapping && mappingTable.length > 0) {
        sections.push({
          type: 'mapping',
          title: '인물 매핑표 (교사 확인용)',
          items: mappingTable,
        })
      }
      if (selectedSections.ai && aiStatus === 'done' && aiSummary) {
        sections.push({ type: 'ai', title: 'AI 요약·추천', content: aiSummary })
      }

      await generatePDF(sections, buildPdfFileName())
    } finally {
      setPdfGenerating(false)
      setPdfModalOpen(false)
    }
  }

  return (
    <div className="result">
      <header className="result-header">
        <div className="result-header-info">
          <span className="mode-badge">{MODE_LABELS[mode] ?? MODE_LABELS.ocr}</span>
          <span className="nickname-badge">{nickname}님</span>
        </div>
      </header>

      {pageLimitNotice && (
        <div className="masking-notice error">
          <span>{pageLimitNotice}</span>
          <button
            type="button"
            className="masking-notice-close"
            onClick={() => setPageLimitNotice('')}
            aria-label="안내 닫기"
          >
            ×
          </button>
        </div>
      )}

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
              <button
                type="button"
                className="text-action-button"
                onClick={() => setPdfModalOpen(true)}
                disabled={ocrStatus !== 'done'}
              >
                PDF 다운로드
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
              {ocrProgressMessage && (
                <span className="stage-page-progress">{ocrProgressMessage}</span>
              )}
            </div>
          ) : (
            <textarea
              className="ocr-textarea"
              value={ocrText}
              onChange={handleTextChange}
            />
          )}

          {ocrStatus === 'done' && mappingTable.length > 0 && (
            <div className="mapping-table-card">
              <h3>🔒 인물 매핑표 (교사 확인용)</h3>
              <ul className="mapping-table-list">
                {mappingTable.map((entry) => (
                  <li key={entry.alias}>
                    {entry.alias}: {entry.name}
                  </li>
                ))}
              </ul>
            </div>
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
                {parseAiSections(aiSummary).map((section, index) => (
                  <div className="ai-summary-section" key={section.title}>
                    {index > 0 && <hr className="ai-summary-divider" />}
                    <h4>{section.title}</h4>
                    <p dangerouslySetInnerHTML={{ __html: formatAiSummary(section.content) }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <PdfSectionModal
        open={pdfModalOpen}
        hasMapping={mappingTable.length > 0}
        hasAi={aiStatus === 'done' && Boolean(aiSummary)}
        generating={pdfGenerating}
        onCancel={() => setPdfModalOpen(false)}
        onConfirm={handlePdfConfirm}
      />
    </div>
  )
}

export default ResultPage
