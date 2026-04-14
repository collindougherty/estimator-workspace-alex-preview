import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthContextValue = {
  isLoading: boolean
  session: Session | null
  user: User | null
  signIn: (email: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
