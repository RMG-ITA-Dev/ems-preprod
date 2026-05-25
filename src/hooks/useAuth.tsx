import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface RoleAssignmentResult {
  role: string;
  isFirstUser: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: Error | null; roleData?: RoleAssignmentResult; emailConfirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  checkUserExists: (email: string) => Promise<{ exists: boolean; error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Assigns a role to the user via the edge function.
 * First user in zero-state becomes admin, subsequent users become staff.
 */
async function assignUserRole(session: Session): Promise<RoleAssignmentResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('assign-user-role', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    
    if (error) {
      console.error('Failed to assign role:', error);
      return null;
    }
    
    return data as RoleAssignmentResult;
  } catch (err) {
    console.error('Error calling assign-user-role:', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error && data.session) {
      // Check if linked staff record is inactive
      const { data: staffCheck } = await supabase
        .from('staff')
        .select('is_active')
        .eq('auth_user_id', data.user.id)
        .maybeSingle();

      if (staffCheck && staffCheck.is_active === false) {
        await supabase.auth.signOut();
        return { error: new Error('ACCOUNT_INACTIVE') };
      }

      // No staff record at all — check if admin (bootstrap) or block
      if (!staffCheck) {
        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!adminRole) {
          await supabase.auth.signOut();
          return { error: new Error('NO_STAFF_RECORD') };
        }
        // Admin without staff record: allow login, ProtectedRoute sends to /bootstrap
      }

      // Ensure user has a role (handles users who signed up before this fix)
      await assignUserRole(data.session);
    }
    
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
    
    if (!error && data.user && !data.session) {
      // Email confirmation required - user exists but no session yet
      if (data.user.identities && data.user.identities.length > 0) {
        return { error: null, emailConfirmationRequired: true };
      }
    }

    if (!error && data.session) {
      // Auto-confirm is on (shouldn't happen now, but handle gracefully)
      const roleData = await assignUserRole(data.session);
      return { error: null, roleData: roleData || undefined };
    }
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error: error as Error | null };
  };

  const resetPasswordForEmail = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error: error as Error | null };
  };

  const checkUserExists = async (email: string) => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('staff_id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (error) {
        return { exists: false, error: error as Error };
      }

      return { exists: !!data, error: null };
    } catch (err) {
      return { exists: false, error: err as Error };
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, updatePassword, resetPasswordForEmail, checkUserExists }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
