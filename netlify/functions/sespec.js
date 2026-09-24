import Anthropic from '@anthropic-ai/sdk'
import { guardUsage } from './lib/usage.js'
import { logServerError } from './lib/errorLog.js'
import { getAdminDb } from './lib/firebaseAdmin.js'
import { requireSession } from './lib/session.js'
import { buildStyleExampleBlock } from './lib/references.js'
import {
  appendHistory,
  buildHistoryBlock,
  DAILY_HISTORY_CAP,
  detectSimilar,
  loadHistory,
  normalizeHistoryKey,
} from './lib/sespecHistory.js'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const MAX_STUDENTS = 25

const FORBIDDEN_WORDS = ['줌', '네이버', '밴드', '구글', '유튜브', '패들렛', '카카오톡', '대회']

const ABSENCE_TEXT = '장기결석으로 인해 활동 내용이 없음.'

const SESPEC_FAILURE_MESSAGE = '세특 생성 중 오류가 발생했습니다. 다시 시도해주세요.'

const MODE_INSTRUCTIONS = {
  free_semester: '- 자유학기 활동 특성상 참여도·흥미도·활동 후 성장 정도가 드러나도록 작성',
  subject: '- 교과 성취기준에 따른 성취수준 특성 및 참여도·태도 위주로 작성',
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// [개발 중 Mock 규칙 — 가장 중요]
// DEV_MOCK=true 이거나 NODE_ENV=development 환경에서는 실제 API를 호출하지 않는다.
// 프로덕션 배포 전까지 이 조건을 절대 제거하지 말 것.
function isMockMode() {
  return process.env.DEV_MOCK === 'true' || process.env.NODE_ENV === 'development'
}

function findForbiddenWords(text) {
  return FORBIDDEN_WORDS.filter((word) => text.includes(word))
}

function hasNoContent(student) {
  const hasText = Boolean(student.extractedText && student.extractedText.trim())
  const hasKeywords =
    Array.isArray(student.keywords) && student.keywords.some((keyword) => keyword && keyword.trim())
  return !hasText && !hasKeywords
}

function buildStudentsBlock(students) {
  return students
    .map(
      (student) => `[학생: ${student.alias}]
키워드: ${(student.keywords || []).filter(Boolean).join(', ') || '없음'}
활동 내용: ${student.extractedText || '(내용 없음)'}`,
    )
    .join('\n\n')
}

function buildPrompt(mode, students, styleBlock = '') {
  const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.subject

  return `다음은 여러 학생의 활동 결과물에서 추출한 텍스트와 키워드입니다.
각 학생별로 학교생활기록부 세부능력 및 특기사항(세특) 초안을 작성해줘.

작성 규칙:
1. 명사형 어미로 종결 (~임, ~함), 마침표 필수, 현재형으로 작성
2. 다음 금지어를 절대 포함하지 마: 줌·네이버·밴드·구글·유튜브·패들렛·카카오톡 등 플랫폼명, '대회' 단어, 강사명·학원명·특정 대학명, 교외 수상·어학시험 관련 내용
3. 학생 간 동일하거나 유사한 문장 반복 절대 금지 (각 학생의 고유한 내용을 반영해 서로 다르게 작성)
4. 1인당 300자~400자
5. 작성 순서: 활동명 → 구체적 행동 → 결과/성장 → 역량 함양
${modeInstruction}
${styleBlock}
학생별 정보:
${buildStudentsBlock(students)}

응답은 아래 형식으로만 출력하고 다른 설명은 절대 추가하지 마 (학생마다 이 형식을 반복):
[학생: 익명태그]
세특 텍스트`
}

function parseBatchResponse(rawText) {
  const parts = rawText.split(/\[학생:\s*([^\]]+)\]/).slice(1)
  const map = new Map()
  for (let i = 0; i < parts.length; i += 2) {
    const alias = parts[i].trim()
    const content = (parts[i + 1] || '').trim()
    map.set(alias, content)
  }
  return map
}

function buildMockSespec(student, mode) {
  const keywordText = (student.keywords || []).filter(Boolean).join(', ') || '해당 활동'
  const modeLabel = mode === 'free_semester' ? '자유학기 활동' : '수행평가 활동'
  return `[Mock] ${keywordText} 주제로 진행된 ${modeLabel}에 처음부터 끝까지 성실하게 참여함. 활동 초반에는 관련 개념과 배경 지식을 스스로 정리하며 문제 상황을 명확히 파악하였고, 이후 자료를 폭넓게 조사하고 분석하는 과정에서 논리적이고 체계적으로 접근하는 태도를 보임. 모둠 활동에서는 자신의 의견을 적극적으로 제시하는 한편 다른 구성원의 의견도 경청하며 협력적으로 결과물을 완성함. 결과물을 정리하는 과정에서 핵심 내용을 명료하게 전달하려 노력하였고, 활동을 마무리하며 스스로 부족한 점을 점검하고 보완하려는 태도를 보였으며, 이를 통해 문제 해결 역량과 자기주도적 학습 역량을 함양함.`
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return jsonResponse(400, { error: '잘못된 요청입니다.' })
    }

    const { students, mode, subjectName, grade } = payload

    if (!Array.isArray(students) || students.length === 0 || students.length > MAX_STUDENTS) {
      return jsonResponse(400, { error: `학생 수는 1명 이상 ${MAX_STUDENTS}명 이하여야 합니다.` })
    }

    const blocked = await guardUsage('sespec', event)
    if (blocked) return blocked

    const resolvedMode = mode === 'free_semester' ? 'free_semester' : 'subject'

    const absentAliases = new Set(
      students
        .filter((student) => resolvedMode === 'free_semester' && hasNoContent(student))
        .map((student) => student.alias),
    )
    const pendingStudents = students.filter((student) => !absentAliases.has(student.alias))

    const { nickname } = await requireSession(event)
    const db = getAdminDb()

    // 같은 교사·과목·학년으로 오늘 이미 생성한 세특(이전 반 등)을 불러와 중복을 피한다. 하루 누적 상한을 넘으면 중복 검사 없이 생성한다.
    const historyKey = normalizeHistoryKey({ nickname, subjectName, grade })
    let previous = []
    if (historyKey) {
      try {
        previous = await loadHistory(db, historyKey)
      } catch (err) {
        await logServerError(event, 'sespec', '세특 이력 조회 실패(중복 검사 없이 진행)', err)
      }
    }
    const limitReached = previous.length >= DAILY_HISTORY_CAP
    const comparisonEntries = limitReached ? [] : previous

    let generatedByAlias = new Map()
    if (isMockMode()) {
      console.log('[MOCK MODE] 실제 API 미호출')
      for (const student of pendingStudents) {
        generatedByAlias.set(student.alias, buildMockSespec(student, resolvedMode))
      }
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        await logServerError(event, 'sespec', 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
        return jsonResponse(500, { error: SESPEC_FAILURE_MESSAGE })
      }

      if (pendingStudents.length > 0) {
        const client = new Anthropic({ apiKey })

        // 교사 본인의 세특 예시문(문체 학습)이 있으면 프롬프트에 덧붙인다. 없거나 조회에 실패하면 기존 프롬프트 그대로 사용한다.
        let styleBlock = ''
        try {
          styleBlock = await buildStyleExampleBlock(db, { nickname })
        } catch (err) {
          await logServerError(event, 'sespec', '세특 예시문 조회 실패(기존 프롬프트로 진행)', err)
        }
        const historyBlock = buildHistoryBlock(comparisonEntries)

        let response
        try {
          response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [
              { role: 'user', content: buildPrompt(resolvedMode, pendingStudents, styleBlock + historyBlock) },
            ],
          })
        } catch (err) {
          await logServerError(event, 'sespec', 'Anthropic API 호출 실패', err)
          return jsonResponse(502, { error: SESPEC_FAILURE_MESSAGE })
        }

        const textBlock = response.content.find((block) => block.type === 'text')
        if (!textBlock) {
          await logServerError(event, 'sespec', 'Anthropic 응답에 text 블록이 없음', response)
          return jsonResponse(502, { error: SESPEC_FAILURE_MESSAGE })
        }
        generatedByAlias = parseBatchResponse(textBlock.text)
      }
    }

    const results = students.map((student) => {
      const sespec = absentAliases.has(student.alias)
        ? ABSENCE_TEXT
        : generatedByAlias.get(student.alias) || '세특 생성에 실패했습니다.'
      return { alias: student.alias, sespec, forbiddenWords: findForbiddenWords(sespec) }
    })

    // 실제로 생성된 초안만 유사 문장 검사와 이력 저장 대상이다(결석 문구·생성 실패 제외).
    const generatedEntries = students
      .filter((student) => generatedByAlias.has(student.alias) && generatedByAlias.get(student.alias))
      .map((student) => ({ alias: student.alias, text: generatedByAlias.get(student.alias) }))

    let duplicateCheck = null
    if (historyKey) {
      const flagged = limitReached ? new Map() : detectSimilar(generatedEntries, comparisonEntries)
      for (const result of results) result.similar = flagged.has(result.alias)

      let saved = 0
      if (!limitReached) {
        try {
          saved = await appendHistory(db, historyKey, generatedEntries)
        } catch (err) {
          await logServerError(event, 'sespec', '세특 이력 저장 실패', err)
        }
      }
      duplicateCheck = {
        previousCount: previous.length,
        limitReached,
        cap: DAILY_HISTORY_CAP,
        limitReachedNow: !limitReached && previous.length + saved >= DAILY_HISTORY_CAP,
      }
    }

    return jsonResponse(200, { results, duplicateCheck })
  } catch (err) {
    await logServerError(event, 'sespec', '처리되지 않은 오류', err)
    return jsonResponse(500, { error: SESPEC_FAILURE_MESSAGE })
  }
}
