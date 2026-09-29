/**
 * ==============================================================================
 * HELLOCK: PHONE AUTH SERVICE  —  NODE E (User Identity Database)
 * ==============================================================================
 * Node E is a Firestore database dedicated purely to user identity — it is NOT
 * a storage node. It stores:
 *
 *   users/{uid}  →  { phone, uid, name, createdAt, avatar }
 *   phones/{+91XXXXXXXXXX}  →  { uid }   (reverse lookup index)
 *
 * Phone OTP verification is handled client-side using Firebase Phone Auth
 * (RecaptchaVerifier + signInWithPhoneNumber). Once the client gets a Firebase
 * ID token, it sends it here to create/update the user profile and mint a
 * NextAuth-compatible session via the 'phone-otp' CredentialsProvider.
 *
 * This service is ONLY imported on the server side (API routes, NextAuth).
 * ==============================================================================
 */

import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ---------------------------------------------------------------------------
// Firebase Admin SDK — Node E initialization (lazy singleton)
// ---------------------------------------------------------------------------

let _nodeEApp = null;
let _nodeEDb = null;
let _nodeEAuth = null;

function getNodeEApp() {
  if (_nodeEApp) return _nodeEApp;

  const appName = 'hellock-node-e';

  // Reuse if already initialised (hot reload safety)
  if (getApps().find((a) => a.name === appName)) {
    _nodeEApp = getApp(appName);
    return _nodeEApp;
  }

  // Requires FIREBASE_E_* server-only env vars (not NEXT_PUBLIC_)
  const projectId = process.env.FIREBASE_E_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_E_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_E_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      '[NODE_E] Missing Firebase Admin credentials. ' +
        'Set FIREBASE_E_PROJECT_ID, FIREBASE_E_CLIENT_EMAIL, FIREBASE_E_PRIVATE_KEY in .env.local'
    );
  }

  _nodeEApp = initializeApp(
    {
      credential: cert({ projectId, clientEmail, privateKey }),
      databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
    },
    appName
  );

  return _nodeEApp;
}

function getDb() {
  if (_nodeEDb) return _nodeEDb;
  _nodeEDb = getFirestore(getNodeEApp());
  return _nodeEDb;
}

function getAdminAuth() {
  if (_nodeEAuth) return _nodeEAuth;
  _nodeEAuth = getAuth(getNodeEApp());
  return _nodeEAuth;
}

// ---------------------------------------------------------------------------
// Graceful availability check
// ---------------------------------------------------------------------------

export function isPhoneAuthAvailable() {
  return !!(
    process.env.FIREBASE_E_PROJECT_ID &&
    process.env.FIREBASE_E_CLIENT_EMAIL &&
    process.env.FIREBASE_E_PRIVATE_KEY
  );
}

// ---------------------------------------------------------------------------
// Verify Firebase ID Token (issued by client-side Phone Auth)
// Returns the decoded token payload: { uid, phone_number, ... }
// ---------------------------------------------------------------------------

export async function verifyPhoneIdToken(idToken) {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, /* checkRevoked= */ true);

  if (!decoded.phone_number) {
    throw new Error('Token is not a phone-auth token (no phone_number claim)');
  }

  return decoded;
}

// ---------------------------------------------------------------------------
// Upsert user profile in Node E Firestore
// Called after successful OTP verification on the server.
// ---------------------------------------------------------------------------

export async function upsertPhoneUser({ uid, phone, name }) {
  const db = getDb();

  const userRef = db.collection('users').doc(uid);
  const phoneRef = db.collection('phones').doc(normalizePhone(phone));

  const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(phone)}`;

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);

    if (!existing.exists) {
      tx.set(userRef, {
        uid,
        phone: normalizePhone(phone),
        name: name || formatPhoneAsName(phone),
        avatar,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(userRef, {
        updatedAt: FieldValue.serverTimestamp(),
        ...(name && { name }),
      });
    }

    // Always keep the reverse lookup index up-to-date
    tx.set(phoneRef, { uid }, { merge: true });
  });

  const snap = await userRef.get();
  return snap.data();
}

// ---------------------------------------------------------------------------
// Look up a user profile by phone number (used for sharing)
// Returns null if the phone number hasn't registered yet.
// ---------------------------------------------------------------------------

export async function lookupUserByPhone(phone) {
  const db = getDb();
  const normalized = normalizePhone(phone);

  const phoneSnap = await db.collection('phones').doc(normalized).get();
  if (!phoneSnap.exists) return null;

  const { uid } = phoneSnap.data();
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return null;

  return userSnap.data();
}

// ---------------------------------------------------------------------------
// Resolve a list of phone numbers → user profiles (bulk, for ShareModal)
// ---------------------------------------------------------------------------

export async function resolvePhoneNumbers(phones) {
  const results = await Promise.allSettled(phones.map(lookupUserByPhone));
  return phones.reduce((acc, phone, i) => {
    acc[phone] = results[i].status === 'fulfilled' ? results[i].value : null;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Get all users (for admin search — limited to 500)
// ---------------------------------------------------------------------------

export async function searchUsersByPhone(partialPhone) {
  const db = getDb();
  const snap = await db
    .collection('phones')
    .orderBy('__name__')
    .startAt(normalizePhone(partialPhone))
    .endAt(normalizePhone(partialPhone) + '\uf8ff')
    .limit(10)
    .get();

  if (snap.empty) return [];

  const uids = snap.docs.map((d) => d.data().uid);
  const userSnaps = await Promise.all(
    uids.map((uid) => db.collection('users').doc(uid).get())
  );

  return userSnaps.filter((s) => s.exists).map((s) => s.data());
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a phone number to E.164 format (+XXXXXXXXXXX).
 * If the user typed "9876543210" without a country code, default to +91 (India).
 */
export function normalizePhone(raw) {
  if (!raw) return '';
  let cleaned = raw.replace(/[\s\-().]/g, '');
  if (!cleaned.startsWith('+')) cleaned = '+91' + cleaned;
  return cleaned;
}

function formatPhoneAsName(phone) {
  const normalized = normalizePhone(phone);
  // e.g. +919876543210 → "User 9876"
  return 'User ' + normalized.slice(-4);
}

// ---------------------------------------------------------------------------
// Direct / Free OTP Engine (Zero SMS billing required)
// ---------------------------------------------------------------------------
const otpCache = new Map();

export async function generatePhoneOtp(phone) {
  const normalized = normalizePhone(phone);
  // Predictable test code '123456' or random 6-digit
  const code = '123456'; 
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

  otpCache.set(normalized, { code, expiresAt });

  try {
    const db = getDb();
    await db.collection('otps').doc(normalized).set({
      code,
      expiresAt,
      phone: normalized,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[OTP_STORE_WARN]', e.message);
  }

  return code;
}

export async function verifyPhoneOtpDirect(phone, inputOtp) {
  const normalized = normalizePhone(phone);
  const now = Date.now();

  // Master testing PIN for instant access
  if (inputOtp === '123456') {
    return true;
  }

  const cached = otpCache.get(normalized);
  if (cached && cached.expiresAt > now && cached.code === inputOtp) {
    otpCache.delete(normalized);
    return true;
  }

  try {
    const db = getDb();
    const doc = await db.collection('otps').doc(normalized).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.expiresAt > now && data.code === inputOtp) {
        await db.collection('otps').doc(normalized).delete();
        return true;
      }
    }
  } catch (e) {
    console.warn('[OTP_CHECK_WARN]', e.message);
  }

  return false;
}

