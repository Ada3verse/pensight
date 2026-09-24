import './DuplicateCheckNotice.css'

// 세특 생성 결과 위에 "중복 검사를 무엇과 비교했는지" 알려준다.
// duplicateCheck: 서버(sespec.js)가 돌려준 { previousCount, limitReached, cap, limitReachedNow } (없으면 표시하지 않음)
function DuplicateCheckNotice({ duplicateCheck }) {
  if (!duplicateCheck) return null
  const { previousCount, limitReached, cap, limitReachedNow } = duplicateCheck

  if (limitReached) {
    return (
      <p className="duplicate-notice limit" role="status">
        오늘 이 과목·학년의 누적 세특이 {cap}명에 도달해, 이번 생성은 이전 세특과의 중복 검사 없이 진행했습니다.
      </p>
    )
  }

  return (
    <p className="duplicate-notice" role="status">
      중복 검사 기준: 오늘 생성한 {previousCount}명 세특 포함
      {previousCount === 0 && ' (이번에 생성한 학생끼리만 비교)'}
      {limitReachedNow && ` · 하루 누적 ${cap}명에 도달해 이후 생성은 중복 검사 없이 진행됩니다.`}
    </p>
  )
}

export default DuplicateCheckNotice
