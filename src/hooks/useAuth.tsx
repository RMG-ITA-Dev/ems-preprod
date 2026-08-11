import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { rearmSessionRecovery } from '@/lib/sessionRecovery';

// Fase 7 (plan v2 §A.3): events that carry a genuinely authenticated session.
// A 401-triggered recovery cycle stays disarmed until one of these fires
// with a session — this is what stops it from re-triggering in a loop.
const REARM_EVENTS = new Set<AuthChangeEvent>(['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION']);

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
        if (session && REARM_EVENTS.has(event)) {
          rearmSessionRecovery();
        }
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
    // BUG 0514-115: account lockout policy runs server-side inside the
    // `secure-signin` edge function. The client used to call the lockout RPCs
    // directly, but Codex flagged that `anon` could POST `record_failed_login`
    // with any email and lock the account without ever attempting a real
    // login. Migration 20260527000000 strips those anon grants; this function
    // is the only legitimate caller now (via service role), so the counter
    // only moves when GoTrue itself confirms a credential failure.
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke(
      'secure-signin',
      { body: { email, password } },
    );

    if (invokeError) {
      return { error: invokeError as Error };
    }

    const result = invokeData as
      | { ok: true; session: { access_token: string; refresh_token: string } }
      | { ok: false; code: string; message?: string; remaining_seconds?: number; remaining_attempts?: number }
      | null;

    if (!result) {
      return { error: new Error('Sign in failed') };
    }

    if (result.ok === false) {
      if (result.code === 'ACCOUNT_LOCKED') {
        const remaining = result.remaining_seconds ?? 0;
        return { error: new Error(`ACCOUNT_LOCKED:${remaining}`) };
      }
      if (result.code === 'INVALID_CREDENTIALS') {
        if (result.remaining_attempts !== undefined) {
          return { error: new Error(`INVALID_CREDENTIALS:${result.remaining_attempts}`) };
        }
        return { error: new Error('Invalid login credentials') };
      }
      return { error: new Error(result.message ?? 'Sign in failed') };
    }

    // Install the session locally so onAuthStateChange fires and the rest of
    // the app sees an authenticated user.
    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (setErr || !setData.session || !setData.user) {
      return { error: (setErr as Error) ?? new Error('Failed to install session') };
    }

    // Check if linked staff record is inactive
    const { data: staffCheck } = await supabase
      .from('staff')
      .select('is_active')
      .eq('auth_user_id', setData.user.id)
      .maybeSingle();

    if (staffCheck && staffCheck.is_active === false) {
      await supabase.auth.signOut();
      return { error: new Error('ACCOUNT_INACTIVE') };
    }

    // No staff record at all — check if admin (bootstrap) or block
    if (!staffCheck) {
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', setData.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!adminRole) {
        await supabase.auth.signOut();
        return { error: new Error('NO_STAFF_RECORD') };
      }
      // Admin without staff record: allow login, ProtectedRoute sends to /bootstrap
    }

    // Ensure user has a role (handles users who signed up before this fix)
    await assignUserRole(setData.session);

    return { error: null };
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
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    // BUG 0514-115: clear any lockout state so a recovery flow lets the user
    // sign in with the new password immediately instead of waiting out the
    // residual 15-minute window from the failed attempts that preceded reset.
    if (!error && data.user?.email) {
      const { error: resetErr } = await supabase.rpc('reset_login_attempts', {
        p_email: data.user.email.trim().toLowerCase(),
      });
      if (resetErr) {
        console.error('[lockout] reset_login_attempts after password update failed:', resetErr);
      }
    }
    return { error: error as Error | null };
  };

  const resetPasswordForEmail = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, updatePassword, resetPasswordForEmail }}>
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
