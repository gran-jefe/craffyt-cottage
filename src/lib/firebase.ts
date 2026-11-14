import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
)

/**
 * Demo mode keeps data in the visitor's own browser, so an "order" never reaches the studio.
 * It is only allowed in local development or when explicitly requested. A production build
 * without Firebase keys fails loudly instead of telling paying customers their order was received.
 */
export const isDemoMode =
  !isFirebaseConfigured &&
  (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true')

if (!isFirebaseConfigured && !isDemoMode) {
  throw new Error(
    'Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* variables, or set NEXT_PUBLIC_DEMO_MODE=true for a non-production demo.'
  )
}

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let storage: FirebaseStorage | null = null

const firestoreDatabaseId =
  process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || 'craftycottage-db'

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
  db = getFirestore(app, firestoreDatabaseId)
  auth = getAuth(app)
  storage = getStorage(app)
}

export { app, db, auth, storage }
