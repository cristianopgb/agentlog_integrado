import { Injectable } from '@nestjs/common';

type SupabaseUser = { id: string; email?: string };

@Injectable()
export class SupabaseService {
  private readonly url: string;
  private readonly serviceRoleKey: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the API.');
    this.url = url.replace(/\/$/, '');
    this.serviceRoleKey = serviceRoleKey;
  }

  async getUserFromBearerToken(authorization?: string): Promise<SupabaseUser | null> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) return null;
    const response = await fetch(`${this.url}/auth/v1/user`, { headers: { apikey: this.serviceRoleKey, Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    return (await response.json()) as SupabaseUser;
  }

  async select<T>(table: string, query: string): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/${table}?${query}`, { headers: this.adminHeaders() });
    return this.parseResponse<T>(response);
  }

  async upsert<T>(table: string, payload: Record<string, unknown>, onConflict: string): Promise<T> { const response = await fetch(`${this.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, { method: "POST", headers: { ...this.adminHeaders(), Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) }); return this.parseResponse<T>(response); }
  async insert<T>(table: string, payload: Record<string, unknown> | Record<string, unknown>[]): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/${table}`, { method: 'POST', headers: { ...this.adminHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    return this.parseResponse<T>(response);
  }

  async rpc<T>(functionName: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/rpc/${functionName}`, { method: 'POST', headers: this.adminHeaders(), body: JSON.stringify(payload) });
    return this.parseResponse<T>(response);
  }

  async update<T>(table: string, query: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/${table}?${query}`, { method: 'PATCH', headers: { ...this.adminHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    return this.parseResponse<T>(response);
  }

  async delete<T>(table: string, query: string): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: { ...this.adminHeaders(), Prefer: 'return=representation' } });
    return this.parseResponse<T>(response);
  }

  private adminHeaders(): Record<string, string> {
    return { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}`, 'Content-Type': 'application/json' };
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }
}
