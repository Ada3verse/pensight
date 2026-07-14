import { useRef, useState } from 'react'
import {
  checkNicknameExists,
  PinMismatchError,
  saveUserPin,
  verifyUserPin,
} from '../utils/firestoreService'
import './LandingPage.css'

const FEATURES = [
  {
    title: '손글씨 OCR',
    description: '손으로 쓴 답안과 노트를 정확한 텍스트로 변환합니다.',
  },
  {
    title: 'AI 요약·추천',
    description: '추출된 텍스트를 분석해 핵심 요약과 학습 방향을 제안합니다.',
  },
  {
    title: '개인정보 보호',
    description: '업로드한 파일은 본인만 확인할 수 있도록 안전하게 관리됩니다.',
  },
]

const MODES = [
  {
    id: 'ocr',
    label: '빠른 OCR',
    description: '텍스트 추출만 빠르게 진행합니다.',
  },
  {
    id: 'ai',
    label: 'AI 분석',
    description: '텍스트 추출부터 요약·추천까지 진행합니다.',
  },
]

const STEPS = [
  '닉네임 입력',
  '파일 업로드',
  'OCR 분석',
  'AI 결과 확인',
  '저장·복사',
]

const MAX_PIN_ATTEMPTS = 5
const EMPTY_DIGITS = ['', '', '', '']
const GENERIC_ERROR_MESSAGE = '오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

function LandingPage({ onStart, onViewVault }) {
  const [selectedMode, setSelectedMode] = useState('ocr')
  const [nickname, setNickname] = useState('')
  const [formError, setFormError] = useState('')
  const [checkingNickname, setCheckingNickname] = useState(false)

  const [step, setStep] = useState('form')
  const [pendingAction, setPendingAction] = useState(null)
  const [isNewNickname, setIsNewNickname] = useState(false)
  const [digits, setDigits] = useState(EMPTY_DIGITS)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [pinError, setPinError] = useState('')
  const [submittingPin, setSubmittingPin] = useState(false)

  const inputRefs = useRef([])

  const focusDigit = (index) => {
    inputRefs.current[index]?.focus()
  }

  const proceedToPinStep = async (action) => {
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname || checkingNickname) return

    setPendingAction(action)
    setFormError('')
    setCheckingNickname(true)
    try {
      const exists = await checkNicknameExists(trimmedNickname)
      setIsNewNickname(!exists)
      setDigits(EMPTY_DIGITS)
      setAttempts(0)
      setLocked(false)
      setPinError('')
      setStep('pin')
      setTimeout(() => focusDigit(0), 0)
    } catch {
      setFormError('닉네임 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setCheckingNickname(false)
    }
  }

  const handleBackToForm = () => {
    setStep('form')
    setPendingAction(null)
    setDigits(EMPTY_DIGITS)
    setPinError('')
    setLocked(false)
    setAttempts(0)
  }

  const handleWrongPin = () => {
    const nextAttempts = attempts + 1
    setAttempts(nextAttempts)
    setDigits(EMPTY_DIGITS)
    focusDigit(0)
    if (nextAttempts >= MAX_PIN_ATTEMPTS) {
      setLocked(true)
      setPinError('PIN 5회 오류. 관리자에게 PIN 초기화를 요청해주세요.')
    } else {
      setPinError(`PIN이 올바르지 않습니다. (남은 시도: ${MAX_PIN_ATTEMPTS - nextAttempts}회)`)
    }
  }

  const handlePinSuccess = () => {
    const trimmedNickname = nickname.trim()
    if (pendingAction === 'vault') {
      onViewVault?.(trimmedNickname)
    } else {
      onStart?.({ nickname: trimmedNickname, mode: selectedMode })
    }
  }

  const submitPin = async (pinValue) => {
    if (locked || submittingPin || pinValue.length !== 4) return
    const trimmedNickname = nickname.trim()

    setSubmittingPin(true)
    setPinError('')
    try {
      if (isNewNickname) {
        await saveUserPin(trimmedNickname, pinValue)
        handlePinSuccess()
      } else {
        const ok = await verifyUserPin(trimmedNickname, pinValue)
        if (ok) {
          handlePinSuccess()
        } else {
          handleWrongPin()
        }
      }
    } catch (err) {
      if (err instanceof PinMismatchError) {
        handleWrongPin()
      } else {
        setPinError(GENERIC_ERROR_MESSAGE)
        setDigits(EMPTY_DIGITS)
        focusDigit(0)
      }
    } finally {
      setSubmittingPin(false)
    }
  }

  const handleDigitChange = (index, rawValue) => {
    const value = rawValue.replace(/\D/g, '').slice(-1)
    const nextDigits = [...digits]
    nextDigits[index] = value
    setDigits(nextDigits)

    if (value && index < 3) {
      focusDigit(index + 1)
    }

    if (nextDigits.every((digit) => digit !== '')) {
      submitPin(nextDigits.join(''))
    }
  }

  const handleDigitKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      focusDigit(index - 1)
    }
  }

  const handleConfirmClick = () => {
    submitPin(digits.join(''))
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="landing-logo">PenSight</span>
        <span className="landing-nav-note">동신중학교 교사 전용 서비스</span>
      </nav>

      <section className="landing-hero">
        <h1>손글씨를 텍스트로, 텍스트를 통찰로</h1>
        <p>PenSight는 손글씨 문서를 OCR로 변환하고 AI로 분석해주는 서비스입니다.</p>
      </section>

      <section className="landing-features">
        {FEATURES.map((feature) => (
          <div className="feature-card" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="landing-modes">
        {MODES.map((mode) => (
          <button
            type="button"
            key={mode.id}
            className={`mode-button ${selectedMode === mode.id ? 'active' : ''}`}
            onClick={() => setSelectedMode(mode.id)}
          >
            <span className="mode-label">{mode.label}</span>
            <span className="mode-description">{mode.description}</span>
          </button>
        ))}
      </section>

      <section className="landing-start">
        {step === 'form' ? (
          <>
            <div className="start-form">
              <input
                type="text"
                className="nickname-input"
                placeholder="닉네임을 입력하세요"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
              <button
                type="button"
                className="start-button"
                onClick={() => proceedToPinStep('start')}
                disabled={!nickname.trim() || checkingNickname}
              >
                시작하기
              </button>
              <button
                type="button"
                className="vault-button"
                onClick={() => proceedToPinStep('vault')}
                disabled={!nickname.trim() || checkingNickname}
              >
                내 보관함
              </button>
            </div>
            {formError && <p className="pin-error">{formError}</p>}
            <p className="start-note">
              로그인 없이 닉네임만으로 시작합니다. 본인이 업로드한 파일만 표시됩니다.
            </p>
          </>
        ) : (
          <div className="pin-form">
            <p className="pin-nickname">{nickname.trim()}님</p>
            <p className="pin-message">
              {isNewNickname
                ? '새로운 닉네임입니다. PIN 4자리를 설정해주세요.'
                : 'PIN 4자리를 입력해주세요.'}
            </p>
            <div className="pin-digits">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  className="pin-digit-input"
                  value={digit}
                  disabled={locked || submittingPin}
                  onChange={(event) => handleDigitChange(index, event.target.value)}
                  onKeyDown={(event) => handleDigitKeyDown(index, event)}
                />
              ))}
            </div>
            {pinError && <p className="pin-error">{pinError}</p>}
            <div className="pin-actions">
              <button
                type="button"
                className="pin-back-button"
                onClick={handleBackToForm}
              >
                ← 닉네임 다시 입력
              </button>
              <button
                type="button"
                className="start-button"
                onClick={handleConfirmClick}
                disabled={locked || submittingPin || digits.some((d) => d === '')}
              >
                확인
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="landing-steps">
        <h2>이용 방법</h2>
        <ol className="steps-list">
          {STEPS.map((stepLabel, index) => (
            <li className="step-item" key={stepLabel}>
              <span className="step-number">{index + 1}</span>
              <span className="step-label">{stepLabel}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="landing-footer">
        <p>PenSight · 동신중학교 교사 전용 서비스</p>
      </footer>
    </div>
  )
}

export default LandingPage
