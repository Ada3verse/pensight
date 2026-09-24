import { useEffect } from 'react'
import './LegalPage.css'

// 이용약관·개인정보처리방침이 함께 쓰는 문서 레이아웃.
// sections: [{ title, paragraphs?: string[], items?: string[] }]
function LegalPage({ title, effectiveDate, intro, sections }) {
  useEffect(() => {
    window.scrollTo(0, 0)
    const previousTitle = document.title
    document.title = `${title} · PenSight`
    return () => {
      document.title = previousTitle
    }
  }, [title])

  const handleBack = () => {
    window.location.hash = ''
  }

  return (
    <div className="legal">
      <nav className="legal-nav">
        <span className="legal-logo">PenSight</span>
        <button type="button" className="legal-back" onClick={handleBack}>
          ← 처음으로
        </button>
      </nav>

      <main className="legal-main">
        <h1>{title}</h1>
        <p className="legal-meta">시행일: {effectiveDate}</p>
        {intro && <p className="legal-intro">{intro}</p>}

        {sections.map((section, index) => (
          <section className="legal-section" key={section.title}>
            <h2>
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items && (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>

      <footer className="legal-footer">
        <a href="#/terms">이용약관</a>
        <span aria-hidden="true">·</span>
        <a href="#/privacy">개인정보처리방침</a>
      </footer>
    </div>
  )
}

export default LegalPage
