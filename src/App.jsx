import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import UploadPage from './pages/UploadPage'
import ResultPage from './pages/ResultPage'
import VaultPage from './pages/VaultPage'
import AdminPage from './pages/AdminPage'

const PROTECTED_PAGES = ['upload', 'result', 'vault']

function App() {
  const [page, setPage] = useState('landing')
  const [nickname, setNickname] = useState('')
  const [mode, setMode] = useState('ocr')
  const [files, setFiles] = useState([])
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

  const handleAnalyze = (selectedFiles) => {
    setFiles(selectedFiles)
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
    return <LandingPage onStart={handleStart} onViewVault={handleViewVault} />
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

  return <LandingPage onStart={handleStart} onViewVault={handleViewVault} />
}

export default App
