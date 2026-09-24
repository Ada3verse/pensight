import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

let db

export function getAdminDb() {
  if (db) return db

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.')
  }

  const serviceAccount = JSON.parse(raw)
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) })
  db = getFirestore(app)
  return db
}

// 참고자료 원본 파일 보관용 Storage 버킷. FIREBASE_STORAGE_BUCKET(예: 프로젝트ID.firebasestorage.app)이
// 설정되지 않았으면 null을 돌려주고, 이 경우 텍스트만 Firestore에 저장한다.
export function getAdminBucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET
  if (!name) return null
  getAdminDb() // 앱 초기화
  return getStorage().bucket(name)
}
