import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions = {
  providers: [
    // Primary Provider: Google OAuth
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // Demo / Hackathon Quick Login Provider (allows demoing sharing between multiple Google accounts)
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
