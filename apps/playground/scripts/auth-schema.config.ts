/**
 * Config minimal pour le CLI better-auth (generate).
 * Hors de server/utils pour éviter les imports dupliqués au runtime.
 * Utilisé uniquement par: pnpm auth:schema
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { apiKey } from '@better-auth/api-key'

// Stub pour le CLI - le generate n'a pas besoin d'une vraie connexion DB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = {} as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema = {} as any

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: 'http://localhost:3000',
  emailAndPassword: { enabled: true },
  socialProviders: {
    github: {
      clientId: '',
      clientSecret: '',
    },
  },
  account: { accountLinking: { enabled: true } },
  user: { deleteUser: { enabled: true } },
  plugins: [
    apiKey({
      rateLimit: { enabled: false },
    }),
  ],
})
