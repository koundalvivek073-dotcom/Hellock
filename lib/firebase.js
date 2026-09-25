import { initializeApp, getApps } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import fs from 'fs';
import path from 'path';

/**
 * ==============================================================================
 * HELLOCK: DISTRIBUTED STORAGE FIREBASE CLUSTER MANAGER
 * ==============================================================================
 * Initializes 4 isolated Firebase App instances (nodeA, nodeB, nodeC, nodeD),
 * each bound to its own independent cloud project and bucket.
 * 
 * Credentials are read exclusively from environment variables (.env.local)
 * to maintain strict credential hygiene.
 * ==============================================================================
 */

// Ensure .env.local is populated even in standalone Node test scripts
if (!process.env.NEXT_PUBLIC_FIREBASE_A_API_KEY) {
  try {
    const envLocalPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

// Node A Configuration (Primary Storage 1 - practice-32812)
export const firebaseConfigNodeA = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_A_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_A_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_A_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_A_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_A_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_A_APP_ID,
};

// Node B Configuration (Primary Storage 2 - hellock-node-b)
export const firebaseConfigNodeB = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_B_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_B_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_B_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_B_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_B_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_B_APP_ID,
};

// Node C Configuration (Primary Storage 3 - hellock-node-c)
export const firebaseConfigNodeC = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_C_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_C_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_C_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_C_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_C_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_C_APP_ID,
};

// Node D Configuration (Standby / Failover Target - hellock-node-d)
export const firebaseConfigNodeD = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_D_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_D_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_D_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_D_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_D_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_D_APP_ID,
};

const CONFIG_MAP = {
  nodeA: firebaseConfigNodeA,
  nodeB: firebaseConfigNodeB,
  nodeC: firebaseConfigNodeC,
  nodeD: firebaseConfigNodeD,
};

/**
 * Initializes or retrieves a named Firebase App instance for a node.
 * @param {string} nodeId - 'nodeA' | 'nodeB' | 'nodeC' | 'nodeD'
 */
export function getNodeApp(nodeId) {
  const config = CONFIG_MAP[nodeId];
  if (!config) {
    throw new Error(`[FIREBASE_ERR] Unknown node ID: "${nodeId}"`);
  }

  const existing = getApps().find(app => app.name === nodeId);
  if (existing) {
    return existing;
  }

  return initializeApp(config, nodeId);
}

/**
 * Returns the scoped Firebase Storage instance for an individual node.
 * @param {string} nodeId - 'nodeA' | 'nodeB' | 'nodeC' | 'nodeD'
 * @returns {import('firebase/storage').FirebaseStorage}
 */
export function getNodeStorage(nodeId) {
  const app = getNodeApp(nodeId);
  const storage = getStorage(app);
  // Set fast retry timeout (2.5s) to prevent hangs when network drops or buckets are unprovisioned
  storage.maxUploadRetryTime = 2500;
  storage.maxOperationRetryTime = 2500;
  return storage;
}

export function initFirebaseNodeA() { return getNodeStorage('nodeA'); }
export function initFirebaseNodeB() { return getNodeStorage('nodeB'); }
export function initFirebaseNodeC() { return getNodeStorage('nodeC'); }
export function initFirebaseNodeD() { return getNodeStorage('nodeD'); }
export function getFirebaseStorageInstance(nodeId) { return getNodeStorage(nodeId); }
