import { useRef, useState } from 'react'
import { extractTextFromFile, OcrError } from '../utils/ocrService'
import { generatePDF, buildPdfFileName } from '../utils/pdfService'
import { validateFiles } from '../utils/fileValidation'
import './SespecPage.css'

const MIN_KEYWORDS = 3
const MAX_KEYWORDS = 10
const MAX_STUDENTS = 25
const KOREAN_ORDINALS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하']
const SESPEC_FUNCTION_URL = '/.netlify/functions/sespec'

const STEPS = [
  { id: 1, label: '공통 키워드' },
  { id: 2, label: '파일 업로드' },
  { id: 3, label: '세특 생성' },
  { id: 4, label: '결과 확인' },
]

function getAliasSymbol(index) {
  const cycle = Math.floor(index / KOREAN_ORDINALS.length) + 1
  const symbol = KOREAN_ORDINALS[index % KOREAN_ORDINALS.length]
  return cycle === 1 ? symbol : `${symbol}${cycle}`
}

function createStudentItem(file) {
  const isImage = file.type.startsWith('image/')
  return {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    file,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
  }
}

async function requestSespecBatch(batchStudents, mode) {
  let response
  try {
    response = await fetch(SESPEC_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: batchStudents, mode }),
    })
  } catch {
    throw new Error('네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.')
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    throw new Error(data?.error || '세특 생성 중 오류가 발생했습니다.')
  }
  return data.results
}

function SespecPage({ nickname, onBack }) {
  const [step, setStep] = useState(1)

  const [activityName, setActivityName] = useState('')
  const [keywords, setKeywords] = useState([])
  const [keywordInput, setKeywordInput] = useState('')

  const [classNumber, setClassNumber] = useState(1)
  const [students, setStudents] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [rejectedFiles, setRejectedFiles] = useState([])
  const inputRef = useRef(null)

  const [generating, setGenerating] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [processingIndex, setProcessingIndex] = useState(-1)
  const [results, setResults] = useState([])
  const [copyLabel, setCopyLabel] = useState('전체 복사')
  const [pdfGenerating, setPdfGenerating] = useState(false)

  const canAddKeyword =
    Boolean(keywordInput.trim()) &&
    keywords.length < MAX_KEYWORDS &&
    !keywords.includes(keywordInput.trim())

  const addKeyword = () => {
    const value = keywordInput.trim()
    if (!value || keywords.length >= MAX_KEYWORDS || keywords.includes(value)) return
    setKeywords((prev) => [...prev, value])
    setKeywordInput('')
  }

  const removeKeyword = (value) => {
    setKeywords((prev) => prev.filter((keyword) => keyword !== value))
  }

  const handleKeywordKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addKeyword()
    }
  }

  const canProceedToUpload = Boolean(activityName.trim()) && keywords.length >= MIN_KEYWORDS

  const atStudentCapacity = students.length >= MAX_STUDENTS

  const addStudentFiles = async (fileList) => {
    const existingTotalBytes = students.reduce((sum, item) => sum + item.file.size, 0)
    const { accepted, rejected } = await validateFiles(fileList, existingTotalBytes)

    const room = MAX_STUDENTS - students.length
    const toAdd = accepted.slice(0, room)
    const overCapacity = accepted.slice(room).map((file) => ({
      name: file.name,
      message: `최대 인원(${MAX_STUDENTS}명)을 초과해 추가할 수 없습니다.`,
    }))

    if (toAdd.length > 0) {
      setStudents((prev) => [...prev, ...toAdd.map(createStudentItem)])
    }
    setRejectedFiles([
      ...rejected.map(({ file, message }) => ({ name: file.name, message })),
      ...overCapacity,
    ])
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addStudentFiles(event.dataTransfer.files)
  }

  const handleInputChange = (event) => {
    addStudentFiles(event.target.files)
    event.target.value = ''
  }

  const removeStudent = (id) => {
    setStudents((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }

  const buildStudentKeywords = () => [activityName, ...keywords]

  const handleGenerateStart = async () => {
    setGenerating(true)
    const aliases = students.map((_, index) => getAliasSymbol(index))
    setResults(
      students.map((student, index) => ({
        id: student.id,
        alias: aliases[index],
        status: 'pending',
        text: '',
        error: '',
        extractedText: '',
        forbiddenWords: [],
      })),
    )

    setPhase('ocr')
    const ocrOutcomes = []
    for (let index = 0; index < students.length; index += 1) {
      setProcessingIndex(index)
      const student = students[index]
      const alias = aliases[index]
      try {
        const extractedText = await extractTextFromFile(student.file)
        ocrOutcomes.push({ id: student.id, alias, extractedText, failed: false })
      } catch (err) {
        ocrOutcomes.push({
          id: student.id,
          alias,
          extractedText: '',
          failed: true,
          error: err instanceof OcrError ? err.message : 'OCR 처리에 실패했습니다.',
        })
      }
    }
    setProcessingIndex(-1)

    setResults((prev) =>
      prev.map((item) => {
        const outcome = ocrOutcomes.find((entry) => entry.id === item.id)
        if (!outcome) return item
        if (outcome.failed) {
          return { ...item, status: 'error', error: outcome.error }
        }
        return { ...item, extractedText: outcome.extractedText }
      }),
    )

    const batchStudents = ocrOutcomes
      .filter((entry) => !entry.failed)
      .map((entry) => ({
        alias: entry.alias,
        extractedText: entry.extractedText,
        keywords: buildStudentKeywords(),
      }))

    if (batchStudents.length > 0) {
      setPhase('ai')
      try {
        const batchResults = await requestSespecBatch(batchStudents, 'subject')
        setResults((prev) =>
          prev.map((item) => {
            const match = batchResults.find((entry) => entry.alias === item.alias)
            if (!match) return item
            return {
              ...item,
              status: 'done',
              text: match.sespec,
              forbiddenWords: match.forbiddenWords || [],
            }
          }),
        )
      } catch {
        setResults((prev) =>
          prev.map((item) =>
            batchStudents.some((entry) => entry.alias === item.alias)
              ? { ...item, status: 'error', error: '세특 생성 중 오류가 발생했습니다. 다시 시도해주세요.' }
              : item,
          ),
        )
      }
    }

    setPhase('idle')
    setGenerating(false)
    setStep(4)
  }

  const handleRegenerate = async (id) => {
    const index = students.findIndex((student) => student.id === id)
    const existing = results.find((item) => item.id === id)
    if (index === -1 || !existing) return

    setResults((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'pending' } : item)))

    try {
      const extractedText = existing.extractedText || (await extractTextFromFile(students[index].file))
      const batchResults = await requestSespecBatch(
        [{ alias: existing.alias, extractedText, keywords: buildStudentKeywords() }],
        'subject',
      )
      const match = batchResults[0]
      setResults((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'done',
                text: match?.sespec ?? '',
                forbiddenWords: match?.forbiddenWords ?? [],
                extractedText,
                error: '',
              }
            : item,
        ),
      )
    } catch (err) {
      setResults((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'error',
                error: err instanceof OcrError ? err.message : '세특 재생성에 실패했습니다. 다시 시도해주세요.',
              }
            : item,
        ),
      )
    }
  }

  const handleResultTextChange = (id, value) => {
    setResults((prev) => prev.map((item) => (item.id === id ? { ...item, text: value } : item)))
  }

  const handleCopyAll = async () => {
    const combined = results
      .map((item) => `${classNumber}반 '${item.alias}'\n${item.text}`)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(combined)
      setCopyLabel('복사됨')
    } catch {
      setCopyLabel('복사 실패')
    }
    setTimeout(() => setCopyLabel('전체 복사'), 1500)
  }

  const handlePdfDownload = async () => {
    setPdfGenerating(true)
    try {
      const sections = results
        .filter((item) => item.status === 'done')
        .map((item) => ({
          type: 'text',
          title: `${classNumber}반 '${item.alias}'`,
          content: item.text,
        }))
      await generatePDF(sections, buildPdfFileName())
    } finally {
      setPdfGenerating(false)
    }
  }

  return (
    <div className="sespec">
      <header className="sespec-header">
        <button type="button" className="sespec-back-button" onClick={onBack}>
          ← 처음으로
        </button>
        <span className="sespec-nickname-badge">{nickname}님</span>
      </header>

      <nav className="sespec-steps">
        {STEPS.map((item) => (
          <span
            key={item.id}
            className={`sespec-step-tab ${step === item.id ? 'active' : ''} ${step > item.id ? 'complete' : ''}`}
          >
            {item.id}. {item.label}
          </span>
        ))}
      </nav>

      <main className="sespec-main">
        {step === 1 && (
          <section className="sespec-panel">
            <h2>1. 공통 키워드 입력</h2>

            <label className="sespec-field-label" htmlFor="sespec-activity-name">
              수업 활동명/주제
            </label>
            <input
              id="sespec-activity-name"
              type="text"
              className="sespec-text-input"
              value={activityName}
              onChange={(event) => setActivityName(event.target.value)}
              placeholder="예: 모둠별 과학 실험 보고서 작성"
            />

            <label className="sespec-field-label">
              키워드 ({keywords.length}/{MAX_KEYWORDS}, 최소 {MIN_KEYWORDS}개)
            </label>
            <div className="sespec-keyword-input-row">
              <input
                type="text"
                className="sespec-text-input"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={handleKeywordKeyDown}
                placeholder="키워드를 입력하고 Enter"
                disabled={keywords.length >= MAX_KEYWORDS}
              />
              <button
                type="button"
                className="sespec-keyword-add-button"
                onClick={addKeyword}
                disabled={!canAddKeyword}
              >
                +
              </button>
            </div>

            {keywords.length > 0 && (
              <ul className="sespec-keyword-tags">
                {keywords.map((keyword) => (
                  <li className="sespec-keyword-tag" key={keyword}>
                    <span>{keyword}</span>
                    <button
                      type="button"
                      onClick={() => removeKeyword(keyword)}
                      aria-label={`${keyword} 삭제`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="sespec-step-actions">
              <button
                type="button"
                className="sespec-primary-button"
                onClick={() => setStep(2)}
                disabled={!canProceedToUpload}
              >
                다음
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="sespec-panel">
            <h2>2. 학생별 파일 업로드</h2>

            <label className="sespec-field-label" htmlFor="sespec-class-number">
              반 번호
            </label>
            <input
              id="sespec-class-number"
              type="number"
              className="sespec-class-input"
              min={1}
              value={classNumber}
              onChange={(event) => setClassNumber(Math.max(1, Number(event.target.value) || 1))}
            />

            <div
              className={`sespec-dropzone ${isDragging ? 'dragging' : ''} ${atStudentCapacity ? 'disabled' : ''}`}
              onClick={() => !atStudentCapacity && inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                if (!atStudentCapacity) setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <p className="sespec-dropzone-title">
                학생 답안 파일을 끌어다 놓거나 클릭해서 선택하세요
              </p>
              <p className="sespec-dropzone-hint">
                지원 형식: JPG, PNG, PDF · 최대 {MAX_STUDENTS}명 ({students.length}/{MAX_STUDENTS})
              </p>
              <input
                ref={inputRef}
                type="file"
                className="sespec-dropzone-input"
                accept=".jpg,.jpeg,.png,.pdf"
                multiple
                disabled={atStudentCapacity}
                onChange={handleInputChange}
              />
            </div>
            {atStudentCapacity && (
              <p className="sespec-capacity-hint">최대 인원({MAX_STUDENTS}명)에 도달했습니다.</p>
            )}

            {rejectedFiles.length > 0 && (
              <div className="sespec-rejected-notice">
                <p className="sespec-rejected-notice-title">
                  {rejectedFiles.length}개 파일을 추가하지 못했습니다
                </p>
                {rejectedFiles.map((item, index) => (
                  <p className="sespec-rejected-notice-item" key={`${item.name}-${index}`}>
                    {item.name}: {item.message}
                  </p>
                ))}
              </div>
            )}

            {students.length > 0 && (
              <ul className="sespec-student-list">
                {students.map((student, index) => (
                  <li className="sespec-student-item" key={student.id}>
                    {student.previewUrl ? (
                      <img
                        className="sespec-student-thumbnail"
                        src={student.previewUrl}
                        alt={student.file.name}
                      />
                    ) : (
                      <span className="sespec-student-icon">PDF</span>
                    )}
                    <span className="sespec-student-alias">
                      {classNumber}반 '{getAliasSymbol(index)}'
                    </span>
                    <span className="sespec-student-name">{student.file.name}</span>
                    <button
                      type="button"
                      className="sespec-student-remove"
                      onClick={() => removeStudent(student.id)}
                      aria-label={`${student.file.name} 제거`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="sespec-step-actions">
              <button type="button" className="sespec-secondary-button" onClick={() => setStep(1)}>
                ← 이전
              </button>
              <button
                type="button"
                className="sespec-primary-button"
                onClick={() => setStep(3)}
                disabled={students.length === 0}
              >
                다음
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="sespec-panel">
            <h2>3. 세특 생성</h2>

            {!generating && results.length === 0 ? (
              <>
                <div className="sespec-summary-card">
                  <p>
                    <strong>활동명</strong> {activityName}
                  </p>
                  <p>
                    <strong>키워드</strong> {keywords.join(', ')}
                  </p>
                  <p>
                    <strong>학생 수</strong> {classNumber}반 {students.length}명
                  </p>
                </div>
                <div className="sespec-step-actions">
                  <button
                    type="button"
                    className="sespec-secondary-button"
                    onClick={() => setStep(2)}
                  >
                    ← 이전
                  </button>
                  <button
                    type="button"
                    className="sespec-primary-button"
                    onClick={handleGenerateStart}
                  >
                    세특 생성 시작
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="sespec-progress-text">
                  {phase === 'ocr' && processingIndex >= 0
                    ? `${classNumber}반 '${getAliasSymbol(processingIndex)}' 처리 중... (${processingIndex + 1}/${students.length})`
                    : phase === 'ai'
                      ? '전체 학생 세특을 함께 생성하고 있습니다...'
                      : '처리를 마무리하고 있습니다...'}
                </p>
                <ul className="sespec-progress-list">
                  {results.map((item) => (
                    <li className={`sespec-progress-item ${item.status}`} key={item.id}>
                      <span>
                        {classNumber}반 '{item.alias}'
                      </span>
                      <span className="sespec-progress-status">
                        {item.status === 'pending' && '처리 중'}
                        {item.status === 'done' && '완료'}
                        {item.status === 'error' && '오류'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="sespec-panel sespec-panel-wide">
            <div className="sespec-result-header">
              <h2>4. 결과 확인 및 수정</h2>
              <div className="sespec-result-actions">
                <button type="button" className="sespec-secondary-button" onClick={handleCopyAll}>
                  {copyLabel}
                </button>
                <button
                  type="button"
                  className="sespec-primary-button"
                  onClick={handlePdfDownload}
                  disabled={pdfGenerating}
                >
                  {pdfGenerating ? '생성 중...' : 'PDF 다운로드'}
                </button>
              </div>
            </div>

            <div className="sespec-card-grid">
              {results.map((item) => (
                <div className="sespec-card" key={item.id}>
                  <div className="sespec-card-header">
                    <span className="sespec-card-alias">
                      {classNumber}반 '{item.alias}'
                    </span>
                    <button
                      type="button"
                      className="sespec-regenerate-button"
                      onClick={() => handleRegenerate(item.id)}
                      disabled={item.status === 'pending'}
                    >
                      {item.status === 'pending' ? '재생성 중...' : '재생성'}
                    </button>
                  </div>
                  {item.status === 'error' ? (
                    <p className="sespec-card-error">{item.error}</p>
                  ) : (
                    <>
                      {item.forbiddenWords?.length > 0 && (
                        <p className="sespec-card-warning">
                          ⚠️ 금지어 포함: {item.forbiddenWords.join(', ')}
                        </p>
                      )}
                      <textarea
                        className="sespec-card-textarea"
                        value={item.text}
                        onChange={(event) => handleResultTextChange(item.id, event.target.value)}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default SespecPage
