import { useEffect, useRef, useState } from 'react'
import { extractTextFromFile, OcrError } from '../utils/ocrService'
import SespecGeneratorForm from '../components/SespecGeneratorForm'
import ProcessSteps from '../components/ProcessSteps'
import { OCR_HINT, SESPEC_STEPS } from '../utils/processSteps'
import './SespecGenPage.css'

function SespecGenPage({ nickname, initialRawText, files = [], onBack }) {
  const hasFiles = files.length > 0

  const [ocrRunning, setOcrRunning] = useState(hasFiles)
  const [processingIndex, setProcessingIndex] = useState(-1)
  const [ocrStudents, setOcrStudents] = useState([])
  const [ocrError, setOcrError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  // 재시도 시 이미 성공한 파일은 다시 OCR(=Vision 사용량 차감)하지 않도록 결과를 보관한다.
  const cacheRef = useRef({ files: null, results: [] })

  useEffect(() => {
    if (!hasFiles) return

    let cancelled = false

    async function runBatchOcr() {
      setOcrRunning(true)
      setOcrError('')

      if (cacheRef.current.files !== files) cacheRef.current = { files, results: [] }
      const results = files.map(
        (_, index) => cacheRef.current.results[index] ?? { studentId: String(index + 1), rawText: '', failed: true },
      )
      let limitMessage = ''

      for (let index = 0; index < files.length; index += 1) {
        if (cancelled) return
        if (!results[index].failed) continue
        setProcessingIndex(index)
        try {
          const rawText = await extractTextFromFile(files[index])
          results[index] = { studentId: String(index + 1), rawText, failed: false }
        } catch (err) {
          results[index] = { ...results[index], failed: true }
          if (err instanceof OcrError && err.type === 'limit') {
            // 한도 초과 시 남은 파일도 모두 실패하므로 더 시도하지 않는다.
            limitMessage = err.message
            break
          }
        }
      }

      if (cancelled) return
      cacheRef.current.results = results
      setOcrStudents(results)
      setProcessingIndex(-1)

      const failedNames = results
        .map((item, index) => (item.failed ? files[index]?.name || `${index + 1}번째 파일` : null))
        .filter(Boolean)
      if (limitMessage) {
        setOcrError(limitMessage)
      } else if (failedNames.length > 0) {
        setOcrError(`다음 파일의 텍스트 추출에 실패했습니다: ${failedNames.join(', ')}`)
      }
      setOcrRunning(false)
    }

    runBatchOcr()
    return () => {
      cancelled = true
    }
  }, [hasFiles, files, retryKey])

  const initialStudents = hasFiles
    ? ocrStudents.map(({ studentId, rawText }) => ({ studentId, rawText }))
    : initialRawText
      ? [{ rawText: initialRawText }]
      : []

  return (
    <div className="sespec-gen-page">
      <header className="sespec-gen-page-header">
        <button type="button" className="sespec-gen-page-back" onClick={onBack}>
          ← {hasFiles ? '업로드로' : '결과 화면으로'}
        </button>
        <span className="sespec-gen-page-nickname">{nickname}님</span>
      </header>

      <main className="sespec-gen-page-main">
        {hasFiles && ocrRunning ? (
          <ProcessSteps
            steps={SESPEC_STEPS}
            current={1}
            state="running"
            hint={OCR_HINT}
            fileProgress={{ total: files.length, index: Math.max(processingIndex, 0) }}
          />
        ) : (
          <>
            {hasFiles && ocrError && (
              <ProcessSteps
                steps={SESPEC_STEPS}
                current={1}
                state="error"
                error={{
                  message: ocrError,
                  retryLabel: '실패한 파일 다시 시도',
                  onRetry: () => setRetryKey((key) => key + 1),
                }}
              />
            )}
            <SespecGeneratorForm initialStudents={initialStudents} />
          </>
        )}
      </main>
    </div>
  )
}

export default SespecGenPage
