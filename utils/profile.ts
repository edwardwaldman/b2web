// utils/profile.ts — the profiles table, typed and debounced
// ─────────────────────────────────────────────────────────────────────────────
// Thin data layer over public.profiles. Everything app-side is camelCase
// (notifPrefs); the one snake_case column (notif_prefs) is translated here so
// nothing else has to know. saveProfile batches rapid changes (theme cycling,
// rebinding two keys in a row) into one UPDATE after 600ms of quiet;
// flushProfileNow fires whatever is pending immediately, for sign-out, so a
// keybind changed two seconds before logging out still lands.
// tier is read-only on this layer on purpose: the column grant server-side
// rejects client writes, only the payments webhook sets it.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/utils/supabase';

// Real, purchasable tiers. 'owner' is NOT stored here — it's the password-
// gated QA/operator mode in the UI, kept deliberately separate from 'ultra'.
export type Tier = 'free' | 'pro' | 'ultra';
// Old rows used starter/unlimited before the rename; map them forward so a
// pre-existing profile keeps working. Anything unknown falls back to free.
function normalizeTier(v: unknown): Tier {
  switch (v) {
    case 'pro':
    case 'ultra':
    case 'free':
      return v;
    case 'starter':
      return 'pro';
    case 'unlimited':
      return 'ultra';
    default:
      return 'free';
  }
}
export type Theme = 'light' | 'dark' | 'pitch';
export type Keybinds = { phone: string; reviews: string; web: string; map: string };
export type NotifPrefs = { newLeads: boolean; priceDrops: boolean; weekly: boolean; product: boolean };

export type Profile = {
  id: string;
  tier: Tier;
  theme: Theme;
  keybinds: Keybinds;
  notifPrefs: NotifPrefs;
  createdAt: string;
  updatedAt: string;
};

export type ProfilePatch = Partial<Pick<Profile, 'theme' | 'keybinds' | 'notifPrefs'>>;

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, tier, theme, keybinds, notif_prefs, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('profile fetch:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    tier: normalizeTier(data.tier),
    theme: data.theme as Theme,
    keybinds: data.keybinds as Keybinds,
    notifPrefs: data.notif_prefs as NotifPrefs,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── debounced writer ─────────────────────────────────────────────────────────
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: ProfilePatch = {};
let pendingFor: string | null = null;

async function writeNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const userId = pendingFor;
  const patch = pending;
  pending = {};
  pendingFor = null;
  if (!userId || Object.keys(patch).length === 0) return;
  const row: Record<string, unknown> = {};
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.keybinds !== undefined) row.keybinds = patch.keybinds;
  if (patch.notifPrefs !== undefined) row.notif_prefs = patch.notifPrefs;
  const { error } = await supabase.from('profiles').update(row).eq('id', userId);
  if (error) console.error('profile save:', error.message);
}

export function saveProfile(userId: string, patch: ProfilePatch, delay = 600): void {
  if (pendingFor && pendingFor !== userId) { pending = {}; } // user switched, drop stale
  pendingFor = userId;
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void writeNow(); }, delay);
}

// Awaitable: call before supabase.auth.signOut() so the last edit persists.
export function flushProfileNow(): Promise<void> {
  return writeNow();
}
