import {
  shareFileWithUser,
  revokeFileSharing,
  getFileMetadata,
  getUserAccessibleFiles
} from './metadataService.js';
import eventBus from './eventBus.js';

/**
 * ShareService manages access control and Google account permissions per file.
 */

/**
 * Verifies if a given Google account has permission to view or download a file.
 * @param {object} file 
 * @param {string} userEmail 
 * @returns {boolean}
 */
export function hasFileAccess(file, userEmail) {
  if (!file) return false;
  if (!userEmail) return false;

  const normalizedUser = userEmail.trim().toLowerCase();
  const owner = (file.owner || '').trim().toLowerCase();

  // Owner always has access
  if (owner === normalizedUser) return true;

  // Check authorized list
  const authorized = (file.authorizedAccounts || []).map(e => e.trim().toLowerCase());
  return authorized.includes(normalizedUser);
}

/**
 * Grants access to a target Google account for a file.
 * @param {string} fileId 
 * @param {string} requesterEmail 
 * @param {string} targetEmail 
 */
export async function grantAccess(fileId, requesterEmail, targetEmail) {
  const updatedFile = await shareFileWithUser(fileId, requesterEmail, targetEmail);

  eventBus.emitEvent('FILE_SHARED', {
    message: `Access granted: "${updatedFile.filename}" shared by ${requesterEmail} with ${targetEmail}`,
    fileId,
    filename: updatedFile.filename,
    owner: requesterEmail,
    sharedWith: targetEmail
  });

  return updatedFile;
}

/**
 * Revokes access from a target Google account for a file.
 * @param {string} fileId 
 * @param {string} requesterEmail 
 * @param {string} targetEmail 
 */
export async function revokeAccess(fileId, requesterEmail, targetEmail) {
  const updatedFile = await revokeFileSharing(fileId, requesterEmail, targetEmail);

  eventBus.emitEvent('FILE_ACCESS_REVOKED', {
    message: `Access revoked: ${targetEmail} removed from "${updatedFile.filename}" by ${requesterEmail}`,
    fileId,
    filename: updatedFile.filename,
    owner: requesterEmail,
    revokedUser: targetEmail
  });

  return updatedFile;
}

/**
 * Fetches all files owned by or shared with a user.
 * @param {string} userEmail 
 */
export async function getFilesForUser(userEmail) {
  return await getUserAccessibleFiles(userEmail);
}
