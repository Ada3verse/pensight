import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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
