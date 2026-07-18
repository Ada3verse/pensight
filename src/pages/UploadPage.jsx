import { useRef, useState } from 'react'
import './UploadPage.css'

const MODE_LABELS = {
  ocr: '빠른 OCR',
  ai: 'AI 분석',
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

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
  const inputRef = useRef(null)

  const addFiles = (fileList) => {
    const accepted = Array.from(fileList).filter((file) =>
      ACCEPTED_TYPES.includes(file.type),
    )
    if (accepted.length === 0) return
    setFiles((prev) => [...prev, ...accepted.map(createFileItem)])
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
    onAnalyze?.(files.map((item) => item.file))
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
