import { useState } from 'react'
import { AiError, requestCounsel } from '../utils/aiService'
import { COUNSEL_TABS, parseCounsel, parseScriptLines } from '../utils/counselFormat'
import { notifyComplete, requestNotificationPermission } from '../utils/notify'
import './CounselRecommendation.css'

const DOC_TYPE_LABELS = { violence: '학교폭력', career: '진로' }
const COUNSEL_HINT = '보통 20~40초'
const EMPTY_TAB_MESSAGE = '이 항목의 내용을 불러오지 못했습니다. 다시 생성해 보세요.'

// 학교폭력·진로 문서의 AI 분석 결과 아래에 붙는 상담 추천. "상담 추천 보기"를 누를 때만 Claude를 호출한다.
function CounselRecommendation({ docType, text, summary }) {
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState(COUNSEL_TABS[0].id)
  const [copiedTab, setCopiedTab] = useState('')

  const handleLoad = async () => {
    // 완료 알림을 받을 수 있도록 클릭 시점에 브라우저 알림 권한을 요청한다.
    requestNotificationPermission()
    setStatus('loading')
    setError('')
    try {
      const raw = await requestCounsel(text, docType, summary)
      setResult(parseCounsel(raw))
      setActiveTab(COUNSEL_TABS[0].id)
      setStatus('done')
      notifyComplete('상담 추천이 완료됐습니다.')
    } catch (err) {
      setError(err instanceof AiError ? err.message : '상담 추천을 만드는 중 오류가 발생했습니다. 다시 시도해주세요.')
      setStatus('error')
    }
  }

  const handleCopy = async (tabId) => {
    try {
      await navigator.clipboard.writeText(result[tabId])
      setCopiedTab(tabId)
    } catch {
      setCopiedTab('')
    }
    setTimeout(() => setCopiedTab(''), 1500)
  }

  if (status === 'idle') {
    return (
      <div className="counsel">
        <button type="button" className="counsel-start" onClick={handleLoad}>
          상담 추천 보기
        </button>
        <p className="counsel-note">
          {DOC_TYPE_LABELS[docType]} 상담에 참고할 방법론·스크립트·절차를 AI가 제안합니다. 버튼을 누를 때만 생성됩니다.
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="counsel">
        <p className="counsel-loading" role="status">
          <span className="counsel-spinner" aria-hidden="true" />
          상담 추천을 만들고 있습니다... ({COUNSEL_HINT})
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="counsel">
        <div className="counsel-error" role="alert">
          <span>{error}</span>
          <button type="button" className="counsel-retry" onClick={handleLoad}>
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  const content = result[activeTab]

  return (
    <div className="counsel">
      <h3 className="counsel-title">{DOC_TYPE_LABELS[docType]} 상담 추천</h3>

      <div className="counsel-tabs" role="tablist">
        {COUNSEL_TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`counsel-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls="counsel-panel"
            className={`counsel-tab ${activeTab === tab.id ? 'active' : ''}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="counsel-panel" id="counsel-panel" role="tabpanel" aria-labelledby={`counsel-tab-${activeTab}`}>
        {!content ? (
          <p className="counsel-empty">{EMPTY_TAB_MESSAGE}</p>
        ) : activeTab === 'script' ? (
          <ul className="counsel-script">
            {parseScriptLines(content).map((line, index) => (
              <li className={`counsel-line ${line.role === '학생' ? 'student' : line.role === '교사' ? 'teacher' : ''}`} key={index}>
                {line.role && <span className="counsel-role">{line.role}</span>}
                <span className="counsel-line-text">{line.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="counsel-text">{content}</p>
        )}
      </div>

      <div className="counsel-footer">
        <span className="counsel-disclaimer">AI가 만든 참고 자료입니다. 실제 상담과 조치는 교사가 판단해주세요.</span>
        <button type="button" className="counsel-copy" onClick={() => handleCopy(activeTab)} disabled={!content}>
          {copiedTab === activeTab ? '복사됨' : '복사'}
        </button>
      </div>
    </div>
  )
}

export default CounselRecommendation
