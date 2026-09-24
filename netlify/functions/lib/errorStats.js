import { ERRORS_COLLECTION } from './errorLog.js'

export const RECENT_ERROR_LIMIT = 20
export const ERROR_ALERT_THRESHOLD = 10 // 최근 1시간 동안 이 건수 이상이면 관리자 페이지에 경고를 띄운다.

/** 관리자 "에러 현황" 탭용: 최근 오류 목록과 최근 1시간 건수. */
export async function getRecentErrors(db, now = new Date()) {
  const [recent, lastHour] = await Promise.all([
    db.collection(ERRORS_COLLECTION).orderBy('createdAt', 'desc').limit(RECENT_ERROR_LIMIT).get(),
    db
      .collection(ERRORS_COLLECTION)
      .where('createdAt', '>=', new Date(now.getTime() - 60 * 60 * 1000))
      .count()
      .get(),
  ])

  return {
    errors: recent.docs.map((docSnap) => {
      const data = docSnap.data()
      return {
        id: docSnap.id,
        source: data.source,
        name: data.functionName || data.location || '',
        message: data.message,
        stack: data.stack,
        path: data.path,
        page: data.page,
        step: data.step,
        nickname: data.nickname,
        createdAt: data.createdAt?.toMillis?.() ?? new Date(data.createdAt).getTime(),
      }
    }),
    lastHourCount: lastHour.data().count,
    threshold: ERROR_ALERT_THRESHOLD,
  }
}
