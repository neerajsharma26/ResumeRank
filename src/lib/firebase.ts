import {initializeApp, getApps, getApp} from 'firebase/app';
import {getAuth, Auth} from 'firebase/auth';
import {getFirestore, Firestore} from 'firebase/firestore';
import {getStorage, FirebaseStorage} from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

// Ensure services are only initialized once
try {
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (e) {
    // This can happen during hot-reloading in dev.
    // We'll re-use the existing instances.
    console.warn("Firebase services already initialized. This is normal in development.");
    auth = getAuth();
    db = getFirestore();
    storage = getStorage();
}


export {app, auth, db, storage};
