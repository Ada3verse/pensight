import { db } from '../firebase'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { hashPin, verifyPin } from './pinService'

const COLLECTION_NAME = 'documents'
const USERS_COLLECTION_NAME = 'users'

export class PinMismatchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PinMismatchError'
  }
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
  const snapshot = await getDocs(
    query(collection(db, COLLECTION_NAME), where('nickname', '==', nickname)),
  )
  const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  return docs.sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  )
}

export async function deleteDocument(docId) {
  await deleteDoc(doc(db, COLLECTION_NAME, docId))
}

export async function updateDocument(docId, data) {
  await updateDoc(doc(db, COLLECTION_NAME, docId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getAllDocuments() {
  const snapshot = await getDocs(collection(db, COLLECTION_NAME))
  const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  return docs.sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  )
}

export async function getNicknameStats() {
  const docs = await getAllDocuments()
  const counts = new Map()
  for (const docItem of docs) {
    counts.set(docItem.nickname, (counts.get(docItem.nickname) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([nickname, count]) => ({ nickname, count }))
    .sort((a, b) => b.count - a.count)
}

export async function resetNicknamePin(nickname) {
  const userRef = doc(db, USERS_COLLECTION_NAME, nickname)
  await setDoc(userRef, { pin: null, updatedAt: serverTimestamp() }, { merge: true })
}

export async function checkNicknameExists(nickname) {
  const userSnap = await getDoc(doc(db, USERS_COLLECTION_NAME, nickname))
  return userSnap.exists() && Boolean(userSnap.data().pin)
}

export async function saveUserPin(nickname, pin) {
  const userRef = doc(db, USERS_COLLECTION_NAME, nickname)
  const userSnap = await getDoc(userRef)
  const hashedPin = await hashPin(pin)
  const existingPin = userSnap.exists() ? userSnap.data().pin : null

  if (existingPin) {
    if (existingPin !== hashedPin) {
      throw new PinMismatchError('PIN이 일치하지 않습니다.')
    }
    return
  }

  await setDoc(
    userRef,
    {
      nickname,
      pin: hashedPin,
      createdAt: userSnap.exists() ? userSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function verifyUserPin(nickname, pin) {
  const userSnap = await getDoc(doc(db, USERS_COLLECTION_NAME, nickname))
  if (!userSnap.exists()) return false
  return verifyPin(pin, userSnap.data().pin)
}

export async function deleteNicknameAndDocuments(nickname) {
  const snapshot = await getDocs(
    query(collection(db, COLLECTION_NAME), where('nickname', '==', nickname)),
  )
  await Promise.all([
    deleteDoc(doc(db, USERS_COLLECTION_NAME, nickname)),
    ...snapshot.docs.map((docSnap) => deleteDoc(doc(db, COLLECTION_NAME, docSnap.id))),
  ])
  return true
}
