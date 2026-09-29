import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions = {
  providers: [
    // Primary Provider: Google OAuth (requires Google Cloud Console project - free tier available)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // Free Alternative Provider: GitHub OAuth (100% free, no billing required)
    // Setup: github.com/settings/developers → OAuth Apps → New OAuth App
    // Homepage URL: http://localhost:3000
    // Callback URL: http://localhost:3000/api/auth/callback/github
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),

    // Phone OTP Provider — identity backed by Node E Firebase Firestore
    // Client completes Firebase Phone Auth, server verifies token at /api/auth/phone-verify,
    // then client calls signIn('phone-otp', { uid, phone, name, avatar })
    CredentialsProvider({
      id: 'phone-otp',
      name: 'Phone Number (OTP)',
      credentials: {
        uid:    { label: 'Firebase UID', type: 'text' },
        phone:  { label: 'Phone Number', type: 'text' },
        name:   { label: 'Display Name', type: 'text' },
        avatar: { label: 'Avatar URL',   type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.uid || !credentials?.phone) return null;
        // The token was already verified server-side at /api/auth/phone-verify.
        // We trust the uid + phone combo at this point.
        return {
          id:    credentials.uid,
          email: credentials.phone, // phone acts as the unique identifier
          name:  credentials.name || 'Hellock User',
          image: credentials.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(credentials.phone)}`,
          phone: credentials.phone,
        };
      },
    }),

    // Demo / Hackathon Quick Login Provider (no OAuth setup needed)
    CredentialsProvider({
      id: 'demo-google-account',
      name: 'Google Account (Demo Simulation)',
      credentials: {
        email: { label: 'Google Email', type: 'email', placeholder: 'your.name@gmail.com' },
        name: { label: 'Display Name', type: 'text', placeholder: 'Your Name' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const email = credentials.email.trim().toLowerCase();
        const name = credentials.name || email.split('@')[0];
        return {
          id: email,
          email,
          name,
          image: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub || session.user.email;
        session.user.email = session.user.email?.toLowerCase();
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id || user.email;
      }
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'vault_super_secret_hackathon_demo_key_2026',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
