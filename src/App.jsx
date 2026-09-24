import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import UploadPage from './pages/UploadPage'
import ResultPage from './pages/ResultPage'
import VaultPage from './pages/VaultPage'
import AdminPage from './pages/AdminPage'
import SespecPage from './pages/SespecPage'
import SespecGenPage from './pages/SespecGenPage'
import ToastHost from './components/ToastHost'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import { setErrorContext } from './utils/errorReporter'
import { clearSessionToken, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from './utils/session'

const PROTECTED_PAGES = ['upload', 'result', 'vault', 'sespec', 'sespec-generate']

function AppRoutes() {
  const [page, setPage] = useState('landing')
  const [nickname, setNickname] = useState('')
  const [mode, setMode] = useState('ocr')
  const [files, setFiles] = useState([])
  const [docType, setDocType] = useState('general')
  const [pinAuthenticated, setPinAuthenticated] = useState(false)
  const [hash, setHash] = useState(() => window.location.hash)
  const [sespecInitialText, setSespecInitialText] = useState('')
  const [sessionNotice, setSessionNotice] = useState('')

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 오류 기록에 남길 현재 화면 정보
  useEffect(() => {
    setErrorContext({ page: hash.startsWith('#/') ? hash.slice(1) : (page === 'landing' ? page : `${page} (${mode})`) })
  }, [page, mode, hash])

  // 서버가 세션 토큰을 거부(401)하면 로그인 화면으로 돌려보내고 안내한다.
  useEffect(() => {
    const handleSessionExpired = () => {
      setPinAuthenticated(false)
      setPage('landing')
      setSessionNotice(SESSION_EXPIRED_MESSAGE)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [])

  const handleStart = ({ nickname, mode }) => {
    setSessionNotice('')
    setNickname(nickname)
    setMode(mode)
    setPinAuthenticated(true)
    setPage('upload')
  }

  const handleViewVault = (vaultNickname) => {
    setSessionNotice('')
    setNickname(vaultNickname)
    setPinAuthenticated(true)
    setPage('vault')
  }

  const handleSespec = (sespecNickname) => {
    setSessionNotice('')
    setNickname(sespecNickname)
    setPinAuthenticated(true)
    setPage('sespec')
  }

  const handleAnalyze = (selectedFiles, selectedDocType) => {
    setFiles(selectedFiles)
    setDocType(selectedDocType)
    if (mode === 'sespec') {
      setSespecInitialText('')
      setPage('sespec-generate')
    } else {
      setPage('result')
    }
  }

  const handleSespecGenerate = (rawText) => {
    setSespecInitialText(rawText)
    setPage('sespec-generate')
  }

  const returnToLanding = () => {
    clearSessionToken()
    setPinAuthenticated(false)
    setPage('landing')
  }

  if (hash === '#/admin') {
    return <AdminPage />
  }

  // 로그인 없이 볼 수 있는 안내 페이지
  if (hash === '#/terms') {
    return <TermsPage />
  }

  if (hash === '#/privacy') {
    return <PrivacyPage />
  }

  if (PROTECTED_PAGES.includes(page) && !pinAuthenticated) {
    return (
      <LandingPage
        onStart={handleStart}
        onViewVault={handleViewVault}
        onSespec={handleSespec}
        notice={sessionNotice}
      />
    )
  }

  if (page === 'vault') {
    return <VaultPage nickname={nickname} onBack={returnToLanding} />
  }

  if (page === 'result') {
    return (
      <ResultPage
        files={files}
        nickname={nickname}
        mode={mode}
        docType={docType}
        onBack={() => setPage('upload')}
        onSespecGenerate={handleSespecGenerate}
      />
    )
  }

  if (page === 'upload') {
    return (
      <UploadPage
        nickname={nickname}
        mode={mode}
        onBack={returnToLanding}
        onAnalyze={handleAnalyze}
      />
    )
  }

  if (page === 'sespec') {
    return <SespecPage nickname={nickname} onBack={returnToLanding} />
  }

  if (page === 'sespec-generate') {
    return (
      <SespecGenPage
        nickname={nickname}
        initialRawText={sespecInitialText}
        files={mode === 'sespec' ? files : []}
        onBack={() => setPage(mode === 'sespec' ? 'upload' : 'result')}
      />
    )
  }

  return (
    <LandingPage
      onStart={handleStart}
      onViewVault={handleViewVault}
      onSespec={handleSespec}
      notice={sessionNotice}
    />
  )
}

function App() {
  return (
    <>
      <ToastHost />
      <AppRoutes />
    </>
  )
}

export default App
