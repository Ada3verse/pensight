import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import UploadPage from './pages/UploadPage'
import ResultPage from './pages/ResultPage'
import VaultPage from './pages/VaultPage'
import AdminPage from './pages/AdminPage'
import SespecPage from './pages/SespecPage'

const PROTECTED_PAGES = ['upload', 'result', 'vault', 'sespec']

function App() {
  const [page, setPage] = useState('landing')
  const [nickname, setNickname] = useState('')
  const [mode, setMode] = useState('ocr')
  const [files, setFiles] = useState([])
  const [docType, setDocType] = useState('general')
  const [pinAuthenticated, setPinAuthenticated] = useState(false)
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleStart = ({ nickname, mode }) => {
    setNickname(nickname)
    setMode(mode)
    setPinAuthenticated(true)
    setPage('upload')
  }

  const handleViewVault = (vaultNickname) => {
    setNickname(vaultNickname)
    setPinAuthenticated(true)
    setPage('vault')
  }

  const handleSespec = (sespecNickname) => {
    setNickname(sespecNickname)
    setPinAuthenticated(true)
    setPage('sespec')
  }

  const handleAnalyze = (selectedFiles, selectedDocType) => {
    setFiles(selectedFiles)
    setDocType(selectedDocType)
    setPage('result')
  }

  const returnToLanding = () => {
    setPinAuthenticated(false)
    setPage('landing')
  }

  if (hash === '#/admin') {
    return <AdminPage />
  }

  if (PROTECTED_PAGES.includes(page) && !pinAuthenticated) {
    return (
      <LandingPage
        onStart={handleStart}
        onViewVault={handleViewVault}
        onSespec={handleSespec}
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

  return (
    <LandingPage onStart={handleStart} onViewVault={handleViewVault} onSespec={handleSespec} />
  )
}

export default App
