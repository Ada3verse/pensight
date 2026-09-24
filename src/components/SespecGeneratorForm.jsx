import { useState } from 'react'
import { downloadPdf, downloadTxt, downloadXlsx } from '../utils/sespecDownload'
import ProcessSteps from './ProcessSteps'
import DuplicateCheckNotice from './DuplicateCheckNotice'
import { notifyComplete, requestNotificationPermission } from '../utils/notify'
import { SESPEC_HINT, SESPEC_STEPS } from '../utils/processSteps'
import { authedFetch } from '../utils/session'
import { isLimitResponse, readLimitMessage } from '../utils/usageLimit'
import './SespecGeneratorForm.css'

const SESPEC_FUNCTION_URL = '/.netlify/functions/sespec'
const MAX_STUDENTS = 25
const GRADES = [1, 2, 3]

function resolveMode(grade) {
  return grade === 1 ? 'free_semester' : 'subject'
}

function modeLabel(mode) {
  return mode === 'free_semester' ? '자유학기 모드' : '과목별 세특 모드'
}

function createRow(index, overrides = {}) {
  return {
    id: `row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    studentId: overrides.studentId ?? String(index + 1),
    keywords: overrides.keywords ?? '',
    rawText: overrides.rawText ?? '',
  }
}

class SespecLimitError extends Error {}

async function requestSespecGeneration(payload) {
  let response
  try {
    response = await authedFetch(SESPEC_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.')
  }

  if (isLimitResponse(response)) {
    throw new SespecLimitError(await readLimitMessage(response))
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    throw new Error(data?.error || '세특 생성 중 오류가 발생했습니다.')
  }
  return { results: data.results, duplicateCheck: data.duplicateCheck ?? null }
}

function SespecGeneratorForm({ initialStudents = [] }) {
  const isMockMode = import.meta.env.DEV

  const [subjectName, setSubjectName] = useState('')
  const [grade, setGrade] = useState(null)
  const [activityName, setActivityName] = useState('')
  const [teacherStyle, setTeacherStyle] = useState('')

  const [students, setStudents] = useState(() => {
    if (initialStudents.length > 0) {
      return initialStudents.slice(0, MAX_STUDENTS).map((student, index) =>
        createRow(index, {
          studentId: student.studentId ?? student.id ?? String(index + 1),
          keywords: student.keywords ?? '',
          rawText: student.rawText ?? '',
        }),
      )
    }
    return [createRow(0)]
  })

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [duplicateCheck, setDuplicateCheck] = useState(null)
  const [generateError, setGenerateError] = useState('')
  const [copyStates, setCopyStates] = useState({})
  const [resultMeta, setResultMeta] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [copyAllLabel, setCopyAllLabel] = useState('전체 복사')

  const mode = grade ? resolveMode(grade) : null
  const atCapacity = students.length >= MAX_STUDENTS

  const addRow = () => {
    if (atCapacity) return
    setStudents((prev) => [...prev, createRow(prev.length)])
  }

  const removeRow = (id) => {
    setStudents((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  const updateRow = (id, field, value) => {
    setStudents((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  const canGenerate =
    Boolean(subjectName.trim()) &&
    Boolean(grade) &&
    Boolean(activityName.trim()) &&
    students.length > 0 &&
    students.length <= MAX_STUDENTS &&
    students.every((row) => row.studentId.trim()) &&
    !generating

  const handleGenerate = async () => {
    // 완료 알림을 받을 수 있도록 사용자 클릭 시점에 브라우저 알림 권한을 요청한다.
    requestNotificationPermission()
    setError('')
    setGenerateError('')
    setGenerating(true)
    setResults(null)
    setDuplicateCheck(null)

    const payload = {
      mode,
      grade,
      subjectName: subjectName.trim(),
      activityName: activityName.trim(),
      teacherExampleStyle: teacherStyle.trim(),
      students: students.map((row) => ({
        alias: row.studentId.trim(),
        extractedText: row.rawText.trim(),
        keywords: row.keywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
      })),
    }

    try {
      const generation = await requestSespecGeneration(payload)
      setResults(generation.results)
      setDuplicateCheck(generation.duplicateCheck)
      notifyComplete('세특 초안 생성이 완료됐습니다.')
      setResultMeta({
        subjectName: subjectName.trim(),
        grade,
        activityName: activityName.trim(),
      })
    } catch (err) {
      setGenerateError(
        err instanceof SespecLimitError ? err.message : '세특 생성 중 오류가 발생했습니다. 다시 시도해주세요.',
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleResultTextChange = (alias, value) => {
    setResults((prev) => prev.map((item) => (item.alias === alias ? { ...item, sespec: value } : item)))
  }

  const hasResults = Boolean(results && results.length > 0)

  const handleDownload = async (download) => {
    if (!hasResults || downloading) return
    setDownloading(true)
    try {
      await download(results, resultMeta)
    } catch {
      setError('파일 다운로드 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setDownloading(false)
    }
  }

  const handleCopyOne = async (alias, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStates((prev) => ({ ...prev, [alias]: '복사됨' }))
    } catch {
      setCopyStates((prev) => ({ ...prev, [alias]: '복사 실패' }))
    }
    setTimeout(() => {
      setCopyStates((prev) => ({ ...prev, [alias]: undefined }))
    }, 1500)
  }

  const handleCopyAll = async () => {
    const combined = (results || []).map((item) => `${item.alias}\n${item.sespec}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(combined)
      setCopyAllLabel('복사됨')
    } catch {
      setCopyAllLabel('복사 실패')
    }
    setTimeout(() => setCopyAllLabel('전체 복사'), 1500)
  }

  return (
    <div className="sespec-gen">
      {isMockMode && (
        <p className="sespec-gen-mock-banner">⚠️ 현재 Mock 모드입니다. 실제 AI가 호출되지 않습니다.</p>
      )}

      <section className="sespec-gen-panel">
        <h2>세특 생성 정보</h2>

        <label className="sespec-gen-label" htmlFor="sespec-gen-subject">
          과목명
        </label>
        <input
          id="sespec-gen-subject"
          type="text"
          className="sespec-gen-input"
          value={subjectName}
          onChange={(event) => setSubjectName(event.target.value)}
          placeholder="예: 통합과학"
        />

        <label className="sespec-gen-label">학년</label>
        <div className="sespec-gen-grade-row">
          {GRADES.map((value) => (
            <button
              key={value}
              type="button"
              className={`sespec-gen-grade-button ${grade === value ? 'active' : ''}`}
              onClick={() => setGrade(value)}
            >
              {value}학년
            </button>
          ))}
        </div>
        {mode && <p className="sespec-gen-mode-hint">{modeLabel(mode)}로 생성됩니다.</p>}

        <label className="sespec-gen-label" htmlFor="sespec-gen-activity">
          활동명
        </label>
        <input
          id="sespec-gen-activity"
          type="text"
          className="sespec-gen-input"
          value={activityName}
          onChange={(event) => setActivityName(event.target.value)}
          placeholder="예: 모둠별 과학 실험 보고서 작성"
        />

        <label className="sespec-gen-label" htmlFor="sespec-gen-style">
          교사 문체 예시 (선택)
        </label>
        <input
          id="sespec-gen-style"
          type="text"
          className="sespec-gen-input"
          value={teacherStyle}
          onChange={(event) => setTeacherStyle(event.target.value)}
          placeholder="예: ~하며 ~를 보임."
        />
      </section>

      <section className="sespec-gen-panel">
        <div className="sespec-gen-list-header">
          <h2>학생 목록</h2>
          <span className="sespec-gen-count">
            {students.length}/{MAX_STUDENTS}
          </span>
        </div>

        <ul className="sespec-gen-row-list">
          {students.map((row, index) => (
            <li className="sespec-gen-row" key={row.id}>
              <input
                type="text"
                className="sespec-gen-row-id"
                value={row.studentId}
                onChange={(event) => updateRow(row.id, 'studentId', event.target.value)}
                placeholder="학생 ID/번호"
                aria-label={`${index + 1}번째 학생 ID`}
              />
              <input
                type="text"
                className="sespec-gen-row-keywords"
                value={row.keywords}
                onChange={(event) => updateRow(row.id, 'keywords', event.target.value)}
                placeholder="키워드 (쉼표로 구분)"
                aria-label={`${index + 1}번째 학생 키워드`}
              />
              <textarea
                className="sespec-gen-row-text"
                value={row.rawText}
                onChange={(event) => updateRow(row.id, 'rawText', event.target.value)}
                placeholder="원문 텍스트"
                aria-label={`${index + 1}번째 학생 원문`}
              />
              <button
                type="button"
                className="sespec-gen-row-remove"
                onClick={() => removeRow(row.id)}
                disabled={students.length <= 1}
                aria-label={`${index + 1}번째 학생 삭제`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <button type="button" className="sespec-gen-secondary-button" onClick={addRow} disabled={atCapacity}>
          + 학생 추가
        </button>
      </section>

      {(generating || generateError || hasResults) && (
        <ProcessSteps
          steps={SESPEC_STEPS}
          current={generating || generateError ? 2 : 3}
          state={generating ? 'running' : generateError ? 'error' : 'complete'}
          hint={SESPEC_HINT}
          error={{ message: generateError, retryLabel: '세특 생성 다시 시도', onRetry: handleGenerate }}
        />
      )}

      {error && <p className="sespec-gen-error">{error}</p>}

      <p className="sespec-gen-length-hint">생성되는 세특 초안은 학생 1인당 300자~400자 내외로 작성됩니다.</p>

      <div className="sespec-gen-actions">
        <button
          type="button"
          className="sespec-gen-primary-button"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {generating ? (
            <>
              <span className="sespec-gen-spinner" aria-hidden="true" />
              생성 중...
            </>
          ) : (
            '세특 생성'
          )}
        </button>
      </div>

      {results && results.length > 0 && (
        <section className="sespec-gen-panel sespec-gen-results">
          <div className="sespec-gen-list-header">
            <h2>생성 결과</h2>
          </div>

          <DuplicateCheckNotice duplicateCheck={duplicateCheck} />

          <div className="sespec-gen-card-grid">
            {results.map((item) => (
              <div className="sespec-gen-card" key={item.alias}>
                <div className="sespec-gen-card-header">
                  <span className="sespec-gen-card-alias">{item.alias}</span>
                  <button
                    type="button"
                    className="sespec-gen-copy-button"
                    onClick={() => handleCopyOne(item.alias, item.sespec)}
                  >
                    {copyStates[item.alias] || '복사'}
                  </button>
                </div>
                {item.similar && (
                  <p className="sespec-gen-warning">⚠️ 유사 표현 주의: 오늘 생성한 다른 세특과 비슷한 문장이 있습니다.</p>
                )}
                {item.forbiddenWords?.length > 0 && (
                  <p className="sespec-gen-warning">⚠️ 금지어 포함: {item.forbiddenWords.join(', ')}</p>
                )}
                <textarea
                  className="sespec-gen-card-textarea"
                  value={item.sespec}
                  onChange={(event) => handleResultTextChange(item.alias, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="sespec-gen-step-actions">
            <button type="button" className="sespec-gen-secondary-button" onClick={handleCopyAll}>
              {copyAllLabel}
            </button>
            <button
              type="button"
              className="sespec-gen-secondary-button"
              onClick={() => handleDownload(downloadXlsx)}
              disabled={!hasResults || downloading}
            >
              XLSX 다운로드
            </button>
            <button
              type="button"
              className="sespec-gen-secondary-button"
              onClick={() => handleDownload(downloadPdf)}
              disabled={!hasResults || downloading}
            >
              PDF 다운로드
            </button>
            <button
              type="button"
              className="sespec-gen-secondary-button"
              onClick={() => handleDownload(downloadTxt)}
              disabled={!hasResults || downloading}
            >
              TXT 다운로드
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

export default SespecGeneratorForm
