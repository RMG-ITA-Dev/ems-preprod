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
    // BUG 0514-115: account lockout policy. Normalize email so the gate keys
    // align with the GoTrue lookup (which case-folds emails).
    const emailNormalized = email.trim().toLowerCase();

    // Pre-check: if the account is locked, do not call GoTrue.
    // Fail-open on RPC error so a transient DB problem doesn't lock every user
    // out of the app; surface the error for monitoring instead.
    const { data: precheck, error: precheckErr } = await supabase.rpc('check_login_allowed', {
      p_email: emailNormalized,
    });
    if (precheckErr) {
      console.error('[lockout] check_login_allowed failed:', precheckErr);
    }
    if (precheck && (precheck as { allowed?: boolean }).allowed === false) {
      const remaining = (precheck as { remaining_seconds?: number }).remaining_seconds ?? 0;
      return { error: new Error(`ACCOUNT_LOCKED:${remaining}`) };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error?.message === 'Invalid login credentials') {
      // Only count true credential failures; ignore network errors and other GoTrue errors.
      // Fail-open on RPC error so the credentials error is still surfaced to the user;
      // surface the gate failure for monitoring instead.
      const { data: record, error: recordErr } = await supabase.rpc('record_failed_login', {
        p_email: emailNormalized,
      });
      if (recordErr) {
        console.error('[lockout] record_failed_login failed:', recordErr);
      }
      if (record && (record as { locked?: boolean }).locked === true) {
        const remaining = (record as { remaining_seconds?: number }).remaining_seconds ?? 0;
        return { error: new Error(`ACCOUNT_LOCKED:${remaining}`) };
      }
      return { error: error as Error | null };
    }

    if (!error && data.session) {
      // Successful login: clear the failure counter.
      await supabase.rpc('reset_login_attempts', { p_email: emailNormalized });

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
