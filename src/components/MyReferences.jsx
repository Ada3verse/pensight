import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteMyReference,
  listMyReferences,
  PERSONAL_CATEGORIES,
  uploadMyReference,
} from '../utils/referenceService'
import './MyReferences.css'

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 교사 본인에게만 적용되는 개인 참고자료(수행평가 채점 기준표, 세특 예시문) 관리.
function MyReferences() {
  const [references, setReferences] = useState([])
  const [category, setCategory] = useState(PERSONAL_CATEGORIES[0].id)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const inputRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setReferences(await listMyReferences())
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setMessage({ type: '', text: '' })
    try {
      await uploadMyReference(category, file)
      setMessage({ type: 'success', text: `'${file.name}'을(를) 등록했습니다.` })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`'${item.fileName}'을(를) 삭제하시겠습니까?`)) return
    try {
      await deleteMyReference(item.id)
      setReferences((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const selected = PERSONAL_CATEGORIES.find((item) => item.id === category)

  return (
    <section className="my-refs">
      <h2>내 참고자료</h2>
      <p className="my-refs-desc">
        여기에 올린 자료는 본인 닉네임에만 연결되며, AI 분석과 세특 생성 때 참고 자료로 함께 전달됩니다.
      </p>

      <div className="my-refs-form">
        <select
          className="my-refs-select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="자료 종류"
        >
          {PERSONAL_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="my-refs-upload"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '올리는 중...' : 'PDF·TXT 올리기'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="my-refs-input"
          onChange={handleFileChange}
        />
      </div>
      <p className="my-refs-hint">{selected?.hint} 텍스트가 있는 PDF·TXT만 지원하며 최대 4MB, 10개까지 등록할 수 있습니다.</p>

      {message.text && (
        <p className={`my-refs-message ${message.type}`} role="status">
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="my-refs-empty">불러오는 중...</p>
      ) : references.length === 0 ? (
        <p className="my-refs-empty">등록된 참고자료가 없습니다.</p>
      ) : (
        <ul className="my-refs-list">
          {references.map((item) => (
            <li className="my-refs-item" key={item.id}>
              <div className="my-refs-item-info">
                <span className="my-refs-badge">{item.categoryLabel}</span>
                <span className="my-refs-name">{item.fileName}</span>
                <span className="my-refs-meta">{formatDate(item.createdAt)}</span>
              </div>
              <button type="button" className="my-refs-delete" onClick={() => handleDelete(item)}>
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default MyReferences
