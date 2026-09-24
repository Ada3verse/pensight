import { authedFetch, setSessionToken } from './session'

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

export async function saveDocument(mode, fileName, extractedText) {
  const response = await authedFetch(DOCUMENTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, fileName, extractedText }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.id) throw new Error(data?.error || '저장에 실패했습니다.')
  return data.id
}

export async function getDocuments() {
  const response = await authedFetch(DOCUMENTS_URL)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || '문서를 불러오지 못했습니다.')
  return data.documents
}

export async function deleteDocument(docId) {
  const response = await authedFetch(DOCUMENTS_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || '삭제에 실패했습니다.')
  }
}

export async function updateDocument(docId, data) {
  const response = await authedFetch(DOCUMENTS_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, data }),
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

export async function getTodayUsage() {
  return postAdmin('usageToday')
}

// 공용 참고자료(매뉴얼) 관리 — 관리자 전용
export async function listSharedReferences() {
  const { references } = await postAdmin('referencesList')
  return references
}

export async function createSharedReference(category, prepared) {
  return postAdmin('referenceCreate', { category, ...prepared })
}

export async function deleteSharedReference(id) {
  await postAdmin('referenceDelete', { id })
}

export async function getRecentErrors() {
  return postAdmin('errorsRecent')
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
  setSessionToken(result.token)
}

export async function verifyUserPin(nickname, pin) {
  const { ok, token } = await postJson(AUTH_URL, { action: 'verify', nickname, pin })
  if (ok) setSessionToken(token)
  return ok
}
