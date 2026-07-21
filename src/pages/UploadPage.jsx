import { useRef, useState } from 'react'
import { validateFiles } from '../utils/fileValidation'
import './UploadPage.css'

const MODE_LABELS = {
  ocr: '빠른 OCR',
  ai: 'AI 분석',
  sespec: '세특 생성',
}

const DOC_TYPES = [
  { id: 'violence', label: '학교폭력 진술서', icon: '🛡️' },
  { id: 'career', label: '진로 상담지', icon: '🧭' },
  { id: 'assignment', label: '수행평가 답안지', icon: '✏️' },
  { id: 'general', label: '일반 문서', icon: '📄' },
]

const DEFAULT_DOC_TYPE = 'general'

function createFileItem(file) {
  const isImage = file.type.startsWith('image/')
  return {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    file,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
  }
}

function UploadPage({ nickname, mode, onBack, onAnalyze }) {
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [docType, setDocType] = useState(DEFAULT_DOC_TYPE)
  const [rejectedFiles, setRejectedFiles] = useState([])
  const inputRef = useRef(null)

  const addFiles = async (fileList) => {
    const existingTotalBytes = files.reduce((sum, item) => sum + item.file.size, 0)
    const { accepted, rejected } = await validateFiles(fileList, existingTotalBytes)

    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted.map(createFileItem)])
    }
    setRejectedFiles(rejected.map(({ file, message }) => ({ name: file.name, message })))
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const handleInputChange = (event) => {
    addFiles(event.target.files)
    event.target.value = ''
  }

  const removeFile = (id) => {
    setFiles((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }

  const handleAnalyze = () => {
    if (files.length === 0) return
    onAnalyze?.(files.map((item) => item.file), docType)
  }

  return (
    <div className="upload">
      <header className="upload-header">
        {onBack && (
          <button type="button" className="back-button" onClick={onBack}>
            ← 처음으로
          </button>
        )}
        <div className="upload-header-info">
          <span className="mode-badge">{MODE_LABELS[mode] ?? MODE_LABELS.ocr}</span>
          <span className="nickname-badge">{nickname}님</span>
        </div>
      </header>

      <main className="upload-main">
        <div className="doc-type-section">
          <p className="doc-type-label">문서 유형을 선택하세요</p>
          <div className="doc-type-grid">
            {DOC_TYPES.map((type) => (
              <button
                type="button"
                key={type.id}
                className={`doc-type-card ${docType === type.id ? 'active' : ''}`}
                onClick={() => setDocType(type.id)}
              >
                <span className="doc-type-icon">{type.icon}</span>
                <span className="doc-type-name">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`dropzone ${isDragging ? 'dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <p className="dropzone-title">파일을 끌어다 놓거나 클릭해서 선택하세요</p>
          <p className="dropzone-hint">지원 형식: JPG, PNG, PDF</p>
          <input
            ref={inputRef}
            type="file"
            className="dropzone-input"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            onChange={handleInputChange}
          />
        </div>

        {rejectedFiles.length > 0 && (
          <div className="rejected-file-notice">
            <p className="rejected-file-notice-title">
              {rejectedFiles.length}개 파일을 추가하지 못했습니다
            </p>
            {rejectedFiles.map((item, index) => (
              <p className="rejected-file-item" key={`${item.name}-${index}`}>
                {item.name}: {item.message}
              </p>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <ul className="file-list">
            {files.map((item) => (
              <li className="file-item" key={item.id}>
                {item.previewUrl ? (
                  <img
                    className="file-thumbnail"
                    src={item.previewUrl}
                    alt={item.file.name}
                  />
                ) : (
                  <span className="file-icon">PDF</span>
                )}
                <span className="file-name">{item.file.name}</span>
                <button
                  type="button"
                  className="file-remove"
                  onClick={() => removeFile(item.id)}
                  aria-label={`${item.file.name} 제거`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {mode === 'sespec' && files.length > 0 && (
          <p className="sespec-order-hint">파일 순서가 학생 순서가 됩니다.</p>
        )}

        <p className="masking-note">
          개인정보는 OCR 완료 후 자동으로 마스킹됩니다. 업로드 전 민감 정보를 직접 가려주셔도 됩니다.
        </p>

        <button
          type="button"
          className="analyze-button"
          onClick={handleAnalyze}
          disabled={files.length === 0}
        >
          분석 시작
        </button>
      </main>
    </div>
  )
}

export default UploadPage
