import { useEffect, useMemo, useRef, useState } from 'react'
import { applyMask, splitMaskSegments } from '../utils/manualMasking'
import './ManualMaskingEditor.css'

// 자동 마스킹이 끝난 텍스트를 보여주고, 교사가 드래그로 고른 부분을 즉시 ■■■으로 치환한다.
function ManualMaskingEditor({ initialText, autoMaskCount, onComplete }) {
  const [text, setText] = useState(initialText)
  const [history, setHistory] = useState([])
  const [confirmed, setConfirmed] = useState(false)
  const textRef = useRef(null)

  const segments = useMemo(() => splitMaskSegments(text), [text])

  const handleUndo = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev
      setText(prev[prev.length - 1])
      setConfirmed(false) // 본문이 바뀌면 다시 확인해야 한다
      return prev.slice(0, -1)
    })
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 텍스트 영역 안에는 텍스트 노드만 있으므로, 영역 시작부터 선택 경계까지의 글자 수가 곧 원문 위치다.
  const offsetOf = (container, offset) => {
    const range = document.createRange()
    range.selectNodeContents(textRef.current)
    range.setEnd(container, offset)
    return range.toString().length
  }

  const maskSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    const root = textRef.current
    if (!root || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return

    const start = offsetOf(range.startContainer, range.startOffset)
    const end = offsetOf(range.endContainer, range.endOffset)
    const next = applyMask(text, start, end)
    selection.removeAllRanges()
    if (next === null || next === text) return

    setHistory((prev) => [...prev, text])
    setText(next)
    setConfirmed(false)
  }

  return (
    <div className="manual-mask">
      <div className="manual-mask-guide">자동 마스킹 완료. 추가로 가릴 내용을 드래그하세요.</div>
      <p className="manual-mask-count">
        {autoMaskCount > 0
          ? `총 ${autoMaskCount}곳이 자동으로 마스킹되었습니다.`
          : '자동으로 마스킹된 곳이 없습니다.'}
      </p>

      <div
        ref={textRef}
        className="manual-mask-text"
        data-testid="manual-mask-text"
        onMouseUp={maskSelection}
        onTouchEnd={() => setTimeout(maskSelection, 0)}
      >
        {segments.map((segment) =>
          segment.masked ? (
            <span className="manual-mask-block" key={segment.start}>
              {segment.text}
            </span>
          ) : (
            <span key={segment.start}>{segment.text}</span>
          ),
        )}
      </div>

      <label className="manual-mask-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          <span className="manual-mask-confirm-label">
            본문을 직접 읽고 개인정보(이름, 연락처, 학번 등)가 모두 가려진 것을 확인했습니다.
          </span>
          <small className="manual-mask-confirm-note">
            자동 마스킹은 보조 도구입니다. 드래그로 추가 마스킹 후 직접 확인해주세요.
          </small>
        </span>
      </label>

      <div className="manual-mask-footer">
        <span className="manual-mask-hint">Ctrl+Z (Mac: ⌘+Z)로 되돌릴 수 있습니다.</span>
        <button
          type="button"
          className="manual-mask-undo"
          onClick={handleUndo}
          disabled={history.length === 0}
        >
          되돌리기
        </button>
        <button
          type="button"
          className="manual-mask-complete"
          onClick={() => onComplete(text)}
          disabled={!confirmed}
        >
          마스킹 완료
        </button>
      </div>
    </div>
  )
}

export default ManualMaskingEditor
