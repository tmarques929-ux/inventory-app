import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// AuthContext provides authentication state and helper functions
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Fetch current session on mount
    const fetchSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
    };
    fetchSession();
    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });
    return () => {
      // Clean up the listener when the component unmounts
      listener.subscription?.unsubscribe();
    };
  }, []);

  /**
   * Sign up a new user using email/password.
   * Returns an object with either data or error.
   */
  const signUpWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  };

  /**
   * Sign in an existing user using email/password.
   * Returns an object with either data or error.
   */
  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  /**
   * Send a magic link to the provided email. When the user clicks the link
   * Supabase will sign them in automatically. See docs for more details.
   */
  const signInWithMagicLink = async (email) => {
    const { data, error } = await supabase.auth.signInWithOtp({ email });
    return { data, error };
  };

  /**
   * Sign out the current user.
   */
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, signUpWithEmail, signInWithEmail, signInWithMagicLink, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);