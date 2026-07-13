'use client';

// components/HeaderAuth.tsx — the auth corner of the screener topbar
// ─────────────────────────────────────────────────────────────────────────────
// Drop-in for the old {authed ? ... : ...} block in S.topMeta. Anonymous:
// Log in (btnO) + Sign up (btnP), both routing to /login exactly like
// goToLogin did (the login page flips login/signup mode in place). Signed in:
// the v11 Account button (email, ellipsis, max-width 180) opening the v11
// menu, plus a muted outlined Sign out beside it, so the cluster stays two
// buttons wide in both states.
//
// Every inline value below is lifted 1:1 from S.* in screener v11
// (outBtn/priBtn/acctMenu/acctItem, notifHead microlabel for the menu
// header). Hover states come from the host page's existing .btnO / .btnP /
// .acctItem rules, nothing new is injected.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/authprovider';

// Palette parity: same CSS vars the app themes on <html data-theme>.
const LINE = 'var(--line)';
const RULE = 'var(--rule)';
const PANEL = 'var(--panel)';
const TEXT = 'var(--text)';
const MUTED = 'var(--muted)';
const BLUE_DEEP = 'var(--blue-deep)';

const ui = "'IBM Plex Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";
const mono = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const S: Record<string, React.CSSProperties> = {
  priBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, background: BLUE_DEEP, color: '#fff', border: `1px solid ${BLUE_DEEP}`, borderRadius: 2, padding: '7px 13px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: ui },
  outBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', color: TEXT, border: `1px solid ${RULE}`, borderRadius: 2, padding: '7px 13px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: ui },
  acctMenu: { position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 172, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 3, boxShadow: '0 14px 38px var(--shadow-strong)', zIndex: 60, padding: 4, display: 'block' },
  acctItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 2, padding: '8px 10px', fontFamily: ui, fontSize: 11.5, color: TEXT, cursor: 'pointer' },
  acctHead: { display: 'block', padding: '7px 10px', fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: MUTED, borderBottom: `1px solid ${LINE}`, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};

type Props = {
  onManageAccount?: () => void; // v11: setAcctOpen(true)
  onPreferences?: () => void;   // v11: setAcctOpen2(true)
  onLogin?: () => void;         // default: router.push('/login')
  onSignup?: () => void;        // default: router.push('/login')
};

export default function HeaderAuth({ onManageAccount, onPreferences, onLogin, onSignup }: Props) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // v11 parity: outside click and Escape both close the menu.
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const doSignOut = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await signOut(); // SIGNED_OUT flips the header via context
    setMenu(false);
    setBusy(false);
    if (error) {
      console.error('signOut:', error.message);
      return; // session persisted, header stays signed in, nothing lied about
    }
    router.replace('/'); // back on the anonymous San Francisco cache
    router.refresh();    // drop any server-rendered user state
  };

  // Reserve the footprint of the two anonymous buttons while the first
  // session read resolves, so the topbar never reflows or flashes the
  // wrong state on load.
  if (loading) {
    return <span style={{ display: 'inline-flex', width: 156, height: 27 }} aria-hidden="true" />;
  }

  if (!user) {
    return (
      <>
        <button className="btnO" style={{ ...S.outBtn, padding: '6px 14px' }}
          onClick={onLogin ?? (() => router.push('/login'))}>Log in</button>
        <button className="btnP" style={{ ...S.priBtn, padding: '6px 16px' }}
          onClick={onSignup ?? (() => router.push('/login'))}>Sign up</button>
      </>
    );
  }

  const email = user.email || 'Account';
  const busyStyle = busy ? { opacity: 0.75, cursor: 'default' as const } : null;

  return (
    <>
      <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
        <button className="btnO" style={{ ...S.outBtn, padding: '6px 12px', maxWidth: 180, whiteSpace: 'nowrap' }}
          onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
        </button>
        {menu && (
          <span style={S.acctMenu} role="menu" aria-label="Account">
            <span style={S.acctHead} title={email}>Signed in as {email}</span>
            {onManageAccount && (
              <button className="acctItem" style={S.acctItem} role="menuitem"
                onClick={() => { setMenu(false); onManageAccount(); }}>Manage account</button>
            )}
            {onPreferences && (
              <button className="acctItem" style={S.acctItem} role="menuitem"
                onClick={() => { setMenu(false); onPreferences(); }}>Preferences</button>
            )}
            <button className="acctItem" style={{ ...S.acctItem, ...busyStyle }} role="menuitem"
              onClick={doSignOut} disabled={busy}>Sign out</button>
          </span>
        )}
      </span>
      <button className="btnO" style={{ ...S.outBtn, padding: '6px 12px', color: MUTED, ...busyStyle }}
        onClick={doSignOut} disabled={busy}>Sign out</button>
    </>
  );
}
