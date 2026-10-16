// Firebase wiring for the Next.js build. Uses the npm firebase SDK
// (same version as the CDN build it replaces: 12.4.0) and exposes the
// same window.Firebase surface the game engine expects, then boots auth.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  doc,
  setDoc,
} from 'firebase/firestore';
import { initBackend } from './game.js';

window.Firebase = {
  initializeApp,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  doc,
  setDoc,
};

if (typeof initBackend === 'function') initBackend();
