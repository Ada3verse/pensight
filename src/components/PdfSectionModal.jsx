import { useEffect, useState } from 'react'
import { PDF_SECTIONS } from '../utils/pdfService'
import './PdfSectionModal.css'

const DEFAULT_SELECTION = { info: true, text: true, mapping: true, ai: true }

function PdfSectionModal({ open, hasMapping, hasAi, generating, onCancel, onConfirm }) {
  const [selected, setSelected] = useState(DEFAULT_SELECTION)

  useEffect(() => {
    if (open) setSelected(DEFAULT_SELECTION)
  }, [open])

  if (!open) return null

  const availableSections = PDF_SECTIONS.filter((section) => {
    if (section.id === 'mapping') return hasMapping
    if (section.id === 'ai') return hasAi
    return true
  })

  const hasAnySelected = availableSections.some((section) => selected[section.id])

  const toggleSection = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div
      className="pdf-modal-backdrop"
      onClick={() => {
        if (!generating) onCancel()
      }}
    >
      <div className="pdf-modal-content" onClick={(event) => event.stopPropagation()}>
        <h2>PDF 다운로드</h2>
        <p className="pdf-modal-hint">포함할 섹션을 선택해주세요.</p>

        <ul className="pdf-modal-section-list">
          {availableSections.map((section) => (
            <li key={section.id}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(selected[section.id])}
                  onChange={() => toggleSection(section.id)}
                  disabled={generating}
                />
                <span>{section.label}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="pdf-modal-actions">
          <button
            type="button"
            className="pdf-modal-button"
            onClick={onCancel}
            disabled={generating}
          >
            취소
          </button>
          <button
            type="button"
            className="pdf-modal-button primary"
            onClick={() => onConfirm(selected)}
            disabled={!hasAnySelected || generating}
          >
            {generating ? '생성 중...' : '다운로드'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PdfSectionModal
