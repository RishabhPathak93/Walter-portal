/**
 * Minimal RPC abstraction so service logic can run against Supabase
 * (supabase-js `.rpc`) in production and directly against PostgreSQL in tests.
 */
export type DbError = { message: string; code?: string };
export type RpcResult<T> = { data: T | null; error: DbError | null };
export type RpcCaller = <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<RpcResult<T>>;

type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export function rpcFromSupabase(client: SupabaseLike): RpcCaller {
  return async <T,>(fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    return { data: (data as T) ?? null, error: error ? { message: error.message, code: error.code } : null };
  };
}
