'use client';

// hooks/useProfileSync.ts — mock settings become account settings
// ─────────────────────────────────────────────────────────────────────────────
// One call inside the Screener component, handed the existing useState pairs.
// Nothing else in the app changes: theme/keybinds/notifPrefs keep living in
// the same local state and keep writing to localStorage through the effects
// already there, so the anonymous experience is untouched and THEME_BOOT
// still paints from b2w-theme pre-hydration.
//
// Signed in, two directions:
//   PULL  on sign-in, fetch the row.
//         · never written before (updated_at == created_at): SEED it from the
//           local state, so the settings someone dialed in anonymously become
//           their account settings on first signup instead of being clobbered
//           by server defaults
//         · written before: server wins, apply to local state (cross-device)
//         tier always flows down; the client cannot write it.
//   PUSH  any later local change saves back, debounced in utils/profile.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/authprovider';
import {
  fetchProfile,
  saveProfile,
  type Keybinds,
  type NotifPrefs,
  type Theme,
  type Tier,
} from '@/utils/profile';

type Args = {
  theme: Theme;           setTheme: (t: Theme) => void;
  keybinds: Keybinds;     setKeybinds: (k: Keybinds) => void;
  notifPrefs: NotifPrefs; setNotifPrefs: (n: NotifPrefs) => void;
  setTier: (t: Tier) => void;
};

export function useProfileSync({
  theme, setTheme, keybinds, setKeybinds, notifPrefs, setNotifPrefs, setTier,
}: Args) {
  const { user } = useAuth();

  // Latest local values, readable inside the pull effect without re-running it.
  const latest = useRef({ theme, keybinds, notifPrefs });
  latest.current = { theme, keybinds, notifPrefs };

  // Which user id has been hydrated; pushes are blocked until the pull lands.
  const hydratedFor = useRef<string | null>(null);
  // Applying server values triggers the push effect once; skip that echo.
  const skipEcho = useRef(false);

  // ── PULL / SEED on sign-in ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { hydratedFor.current = null; return; }
    let alive = true;
    (async () => {
      const p = await fetchProfile(user.id);
      if (!alive) return;
      if (!p) {
        // Row missing (trigger not yet run / offline): stay local-only,
        // do not push blind.
        return;
      }
      if (p.updatedAt === p.createdAt) {
        // Fresh account: local mock state is the truth, seed the row now.
        saveProfile(user.id, { ...latest.current }, 0);
      } else {
        skipEcho.current = true;
        setTheme(p.theme);
        setKeybinds(p.keybinds);
        setNotifPrefs(p.notifPrefs);
      }
      setTier(p.tier);
      hydratedFor.current = user.id;
    })();
    return () => { alive = false; };
    // Deliberately keyed on the user only; settings are read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── PUSH on change ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || hydratedFor.current !== user.id) return;
    if (skipEcho.current) { skipEcho.current = false; return; }
    saveProfile(user.id, { theme, keybinds, notifPrefs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, theme, keybinds, notifPrefs]);
}
