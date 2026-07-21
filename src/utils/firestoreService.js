import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION_NAME = 'documents'

export const ADMIN_TOKEN_KEY = 'pensight_admin_token'

const AUTH_URL = '/.netlify/functions/auth'
const DOCUMENTS_URL = '/.netlify/functions/documents'
const ADMIN_DATA_URL = '/.netlify/functions/admin-data'

export class PinMismatchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PinMismatchError'
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || '요청이 실패했습니다.')
  return data
}

function adminAuthHeaders() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` }
}

async function postAdmin(action, extra = {}) {
  const response = await fetch(ADMIN_DATA_URL, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ action, ...extra }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || '요청이 실패했습니다.')
  return data
}

export async function saveDocument(nickname, mode, fileName, extractedText) {
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    nickname,
    mode,
    fileName,
    extractedText,
    aiSummary: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function getDocuments(nickname) {
  const response = await fetch(`${DOCUMENTS_URL}?nickname=${encodeURIComponent(nickname)}`)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || '문서를 불러오지 못했습니다.')
  return data.documents
}

export async function deleteDocument(docId, nickname) {
  const response = await fetch(DOCUMENTS_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, nickname }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || '삭제에 실패했습니다.')
  }
}

export async function updateDocument(docId, nickname, data) {
  const response = await fetch(DOCUMENTS_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, nickname, data }),
  })
  if (!response.ok) {
    const errBody = await response.json().catch(() => null)
    throw new Error(errBody?.error || '수정에 실패했습니다.')
  }
}

export async function getAllDocuments() {
  const { documents } = await postAdmin('listAll')
  return documents
}

export async function getNicknameStats() {
  const { stats } = await postAdmin('listAll')
  return stats
}

export async function resetNicknamePin(nickname) {
  await postAdmin('resetPin', { nickname })
}

export async function deleteNicknameAndDocuments(nickname) {
  await postAdmin('deleteNickname', { nickname })
  return true
}

export async function checkNicknameExists(nickname) {
  const { exists } = await postJson(AUTH_URL, { action: 'checkExists', nickname })
  return exists
}

export async function saveUserPin(nickname, pin) {
  const result = await postJson(AUTH_URL, { action: 'register', nickname, pin })
  if (!result.success) {
    throw new PinMismatchError('PIN이 일치하지 않습니다.')
  }
}

export async function verifyUserPin(nickname, pin) {
  const { ok } = await postJson(AUTH_URL, { action: 'verify', nickname, pin })
  return ok
}
