import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * Retrieves the currently authenticated Google user session on the server.
 * Returns null or user object { name, email, image, id }.
 */
export async function getAuthenticatedUser(request = null) {
  try {
    const session = await getServerSession(authOptions);
    if (session && session.user) {
      return {
        id: session.user.id || session.user.email,
        email: session.user.email.toLowerCase(),
        name: session.user.name || session.user.email.split('@')[0],
        image: session.user.image || null
      };
    }
  } catch (err) {
    console.error('[AUTH_SERVICE_ERR] Failed reading session:', err);
  }
  return null;
}

/**
 * Fallback helper: Returns session user or a default demo user for testing.
 */
export async function requireUserOrDemo(request = null) {
  const user = await getAuthenticatedUser(request);
  if (user) return user;

  // Fallback demo user for CLI/direct API demoing
  return {
    id: 'demo-user@vault.local',
    email: 'demo@vault.local',
    name: 'Demo Engineer',
    image: null
  };
}
