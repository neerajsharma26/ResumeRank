import {initializeApp, getApps, getApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCQJ6kWgVkL1bA7rzysbxOvKdidgaZj7qM",
  authDomain: "resumerank-8lirw.firebaseapp.com",
  projectId: "resumerank-8lirw",
  storageBucket: "resume-hire.appspot.com",
  messagingSenderId: "975406147971",
  appId: "1:975406147971:web:225780758e836b72b1aeb6"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export {app, auth, db, storage};
