import { useEffect, useState } from 'react'
import { extractTextFromFile } from '../utils/ocrService'
import SespecGeneratorForm from '../components/SespecGeneratorForm'
import './SespecGenPage.css'

function SespecGenPage({ nickname, initialRawText, files = [], onBack }) {
  const hasFiles = files.length > 0

  const [ocrDone, setOcrDone] = useState(!hasFiles)
  const [processingIndex, setProcessingIndex] = useState(-1)
  const [ocrStudents, setOcrStudents] = useState([])
  const [ocrError, setOcrError] = useState('')

  useEffect(() => {
    if (!hasFiles) return

    let cancelled = false

    async function runBatchOcr() {
      const collected = []
      const failedNames = []

      for (let index = 0; index < files.length; index += 1) {
        if (cancelled) return
        setProcessingIndex(index)
        try {
          const rawText = await extractTextFromFile(files[index])
          collected.push({ studentId: String(index + 1), rawText })
        } catch {
          collected.push({ studentId: String(index + 1), rawText: '' })
          failedNames.push(files[index]?.name || `${index + 1}번째 파일`)
        }
      }

      if (cancelled) return
      setOcrStudents(collected)
      setProcessingIndex(-1)
      if (failedNames.length > 0) {
        setOcrError(`다음 파일의 텍스트 추출에 실패했습니다: ${failedNames.join(', ')}`)
      }
      setOcrDone(true)
    }

    runBatchOcr()
    return () => {
      cancelled = true
    }
  }, [hasFiles, files])

  const initialStudents = hasFiles
    ? ocrStudents
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
        {hasFiles && !ocrDone ? (
          <div className="sespec-gen-page-ocr-progress">
            <p>
              파일 텍스트를 추출하고 있습니다... ({Math.max(processingIndex, 0) + 1}/{files.length})
            </p>
          </div>
        ) : (
          <>
            {ocrError && <p className="sespec-gen-page-ocr-error">{ocrError}</p>}
            <SespecGeneratorForm initialStudents={initialStudents} />
          </>
        )}
      </main>
    </div>
  )
}

export default SespecGenPage
