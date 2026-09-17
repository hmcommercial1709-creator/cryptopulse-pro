type SupabaseRow = Record<string, unknown>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required on the server.`);
  return value;
}

const base = () => `${env('SUPABASE_URL')}/rest/v1`;
const headers = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' });

export async function supabaseSelect(table: string, query: string): Promise<SupabaseRow[]> {
  const response = await fetch(`${base()}/${table}?${query}`, { headers: headers(), cache: 'no-store' });
  if (!response.ok) throw new Error(`Supabase select failed: ${response.status}`);
  return await response.json() as SupabaseRow[];
}

export async function supabaseInsert(table: string, row: SupabaseRow): Promise<SupabaseRow[]> {
  const response = await fetch(`${base()}/${table}`, { method: 'POST', headers: { ...headers(), Prefer: 'return=representation' }, body: JSON.stringify(row), cache: 'no-store' });
  if (!response.ok) throw new Error(`Supabase insert failed: ${response.status}`);
  return await response.json() as SupabaseRow[];
}

export async function supabaseUpdate(table: string, query: string, row: SupabaseRow): Promise<SupabaseRow[]> {
  const response = await fetch(`${base()}/${table}?${query}`, { method: 'PATCH', headers: { ...headers(), Prefer: 'return=representation' }, body: JSON.stringify(row), cache: 'no-store' });
  if (!response.ok) throw new Error(`Supabase update failed: ${response.status}`);
  return await response.json() as SupabaseRow[];
}
