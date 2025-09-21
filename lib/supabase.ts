import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialized Supabase clients to make integration optional
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;
let _initialized = false;

// Initialize Supabase clients only if credentials are available
function initializeSupabase(): { success: boolean; error?: string } {
  if (_initialized) {
    return { success: !!_supabase };
  }
  
  _initialized = true;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: 'SUPABASE_URL and SUPABASE_ANON_KEY not configured'
    };
  }
  
  try {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
    _supabaseAdmin = supabaseServiceRoleKey 
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : null;
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize Supabase'
    };
  }
}

// Get Supabase client (returns null if not configured)
export function getSupabase(): SupabaseClient | null {
  const init = initializeSupabase();
  return init.success ? _supabase : null;
}

// Get Supabase admin client (returns null if not configured)
export function getSupabaseAdmin(): SupabaseClient | null {
  const init = initializeSupabase();
  return init.success ? _supabaseAdmin : null;
}

// Health check function - only runs if Supabase is configured
export async function checkSupabaseConnection(): Promise<{ connected: boolean; configured: boolean; error?: string }> {
  const supabase = getSupabase();
  
  if (!supabase) {
    return { connected: false, configured: false };
  }
  
  try {
    // Generic health check that doesn't rely on specific tables
    const { data, error } = await supabase.auth.getSession();
    
    // If we get a response (even if no session), connection is working
    return { connected: true, configured: true };
  } catch (err) {
    return { 
      connected: false, 
      configured: true,
      error: 'Connection failed'
    };
  }
}

// Export types for TypeScript support
export type { SupabaseClient };