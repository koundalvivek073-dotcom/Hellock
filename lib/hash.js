import crypto from 'crypto';
import fs from 'fs';

/**
 * Calculates SHA-256 hash from a Buffer or string.
 * @param {Buffer|string} data 
 * @returns {string} Hex SHA-256 hash
 */
export function calculateHash(data) {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Calculates SHA-256 hash directly from a file path.
 * @param {string} filePath 
 * @returns {Promise<string>} Hex SHA-256 hash
 */
export async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`));
      }
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Compares data against an expected SHA-256 hash.
 * @param {Buffer|string} data 
 * @param {string} expectedHash 
 * @returns {boolean}
 */
export function verifyHash(data, expectedHash) {
  const computed = calculateHash(data);
  return computed.toLowerCase() === expectedHash.toLowerCase();
}
