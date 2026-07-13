'use client';

// app/login/page.tsx — app.b2web.site/login
// ─────────────────────────────────────────────────────────────────────────────
// The b2web.site auth gate, lifted 1:1 from screener v11 and wired to real
// Supabase email/password auth. Markup, classes, inline styles, palette, and
// the live-preview table are unchanged. What is new:
//   · useState bindings on the email + password inputs
//   · Continue → supabase.auth.signInWithPassword() (login mode)
//              → supabase.auth.signUp()             (signup mode)
//   · "Create a free account" / "Log in" flips the mode in place
//   · a subtle bordered message strip under Continue for Supabase
//     errors and successes (uses the existing --red / --green vars)
//   · real async spinners: 650ms floor so the Spin never just flickers
// Assumes the Supabase client is exported as `supabase` from @/utils/supabase.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

// Palette parity with the app: OLED (pitch) is the first-visit default; a
// choice saved by the screener under b2w-theme always wins. Runs inline,
// pre-paint, so the page never flashes the wrong palette (SSR-safe — no
// useLayoutEffect on the server).
const THEME_BOOT =
  "try{var v=localStorage.getItem('b2w-theme');" +
  "document.documentElement.setAttribute('data-theme',(v==='light'||v==='dark'||v==='pitch')?v:'pitch')}" +
  "catch(e){document.documentElement.setAttribute('data-theme','pitch')}";

// ── palette: CSS vars, themed on <html data-theme> exactly like the app ─────
const BG = 'var(--bg)';
const PANEL = 'var(--panel)';
const PANEL2 = 'var(--panel-2)';
const LINE = 'var(--line)';
const RULE = 'var(--rule)';
const TEXT = 'var(--text)';
const MUTED = 'var(--muted)';
const FAINT = 'var(--faint)';
const RED = 'var(--red)';
const AMBER = 'var(--amber)';
const GREEN = 'var(--green)';
const BLUE = 'var(--blue)';
const BLUE_DEEP = 'var(--blue-deep)';

const ui = "'IBM Plex Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";
const mono = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

// NIST-style: length beats complexity. Accept >= 15 chars, or a passphrase
// of 4+ words. No forced numbers/symbols/case. (Same rule the app shows.)
const strongPw = (pw: string) =>
  pw.trim().length >= 15 || pw.trim().split(/\s+/).filter(Boolean).length >= 4;

const emailish = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

function Spin() {
  return (
    <svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" style={{ verticalAlign: '-2px' }} aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

type Busy = null | 'auth';
type Msg = { kind: 'error' | 'success'; text: string } | null;

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const su = mode === 'signup';

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [refReveal, setRefReveal] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePromo, setAgreePromo] = useState(false);

  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pwShake, setPwShake] = useState(false);

  const err = (text: string): Msg => ({ kind: 'error', text });
  const ok = (text: string): Msg => ({ kind: 'success', text });
  const shakePw = () => { setPwShake(true); setTimeout(() => setPwShake(false), 420); };

  const flip = () => {
    setMode(su ? 'login' : 'signup');
    setMsg(null);
    setPwShake(false);
  };

  // Both the brand and Cancel leave the gate for the app root.
  const close = () => router.push('/');

  // Spinner floor: a LAN-fast Supabase round trip would otherwise flash the
  // Spin for ~80ms, which reads as broken. Everything real still awaits.
  const settle = () => new Promise((r) => setTimeout(r, 650));

  // ── Continue: signInWithPassword (login) / signUp (signup) ────────────────
  const submit = async () => {
    if (busy) return;
    const em = email.trim();
    setMsg(null);

    if (!em || !pw.trim()) {
      setMsg(err('Must fill in required fields.'));
      if (!pw.trim()) shakePw();
      return;
    }
    if (!emailish(em)) {
      setMsg(err('Enter a valid email address.'));
      return;
    }
    if (su && !strongPw(pw)) {
      setMsg(err('Use at least 15 characters, or 4+ words as a passphrase.'));
      shakePw();
      return;
    }
    if (su && !agreeTos) {
      setMsg(err('Please agree to the Terms of Service and Privacy Policy to continue.'));
      return;
    }

    setBusy('auth');
    try {
      if (!su) {
        const [{ error }] = await Promise.all([
          supabase.auth.signInWithPassword({ email: em, password: pw }),
          settle(),
        ]);
        if (error) {
          setMsg(err(error.message));
          shakePw();
        } else {
          setMsg(ok('Signed in. Loading your screener…'));
          router.replace('/');
          router.refresh();
          return; // keep the spinner running through the redirect
        }
      } else {
        const [{ data, error }] = await Promise.all([
          supabase.auth.signUp({
            email: em,
            password: pw,
            options: {
              data: {
                promo_opt_in: agreePromo,
                ...(refCode.trim() ? { referral_code: refCode.trim().toUpperCase() } : {}),
              },
            },
          }),
          settle(),
        ]);
        if (error) {
          setMsg(err(error.message));
        } else if (data.user && data.user.identities && data.user.identities.length === 0) {
          // Supabase returns a phantom user (no identities) when the email is
          // already registered and confirmations are on. Route them to login.
          setMode('login');
          setMsg(err('That email already has an account. Log in instead.'));
        } else if (data.session) {
          // Email confirmations disabled in the dashboard: signed in already.
          setMsg(ok('Account created. Loading your screener…'));
          router.replace('/');
          router.refresh();
          return;
        } else {
          setMsg(ok(`Account created. Check ${em} for a confirmation link, then log in.`));
        }
      }
    } catch {
      setMsg(err('Network error. Check your connection and try again.'));
    }
    setBusy(null);
  };

  // Google sign-in was removed for now. The button's slot is kept (hidden)
  // below so the form doesn't shift and a real provider can drop back in.

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit(); };

  const fieldErr = msg?.kind === 'error';

  return (
    <main style={S.gate} aria-label={su ? 'Create a free account' : 'Log in'}>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <style>{CSS}</style>
      <button className="cancelBtn" style={{ ...S.cancelBtn, top: 16, right: 20, zIndex: 2 }} onClick={close} aria-label="Cancel">Cancel</button>

      <div style={S.gateLeft}>
        <button style={{ ...S.brandBtn, fontSize: 16, alignSelf: 'flex-start' }} onClick={close} title="Back to the screener">
          <span style={{ color: TEXT }}>B2Web</span><span style={{ color: RED, fontFamily: mono }}>.site</span>
        </button>

        <div style={{ maxWidth: 360, width: '100%', margin: 'auto 0', alignSelf: 'center' }}>
          <h1 style={{ fontFamily: ui, fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 18px' }}>
            {su ? 'Create a free account' : 'Log in to b2web.site'}
          </h1>

          {/* Google sign-in removed; the slot is kept (hidden) so the form
              below keeps its position and a real OAuth button can drop back in. */}
          <div aria-hidden="true"
            style={{ ...S.outBtn, width: '100%', justifyContent: 'center', background: PANEL2, visibility: 'hidden' }}>
            &nbsp;
          </div>

          <div style={S.orRow}>
            <span style={S.orLine} />
            <span>Or continue with</span>
            <span style={S.orLine} />
          </div>

          <div style={{ ...S.fLabel, marginBottom: 6 }}>Email or phone number</div>
          <input placeholder="email or phone number" style={{ ...S.input, ...(fieldErr && !email.trim() ? { borderColor: RED } : null) }}
            aria-label="Email or phone number" autoComplete="email" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} />

          <div style={{ ...S.fLabel, margin: '10px 0 6px' }}>Password</div>
          <input type="password" placeholder="••••••••" className={pwShake ? 'shake' : ''}
            style={{ ...S.input, ...((fieldErr && !pw.trim()) || pwShake ? { borderColor: RED } : null) }}
            aria-label="Password" autoComplete={su ? 'new-password' : 'current-password'}
            value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={onEnter} />
          {su && (
            <div style={{ fontSize: 10, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
              At least 15 characters, or 4+ words as a passphrase. No numbers or symbols required.
            </div>
          )}

          <button className="btnP" style={{ ...S.priBtn, width: '100%', marginTop: 14, justifyContent: 'center', ...(busy === 'auth' ? { opacity: 0.75, cursor: 'default' } : null) }}
            onClick={submit} disabled={!!busy}>
            {busy === 'auth' ? (<><Spin /> {su ? 'Creating account' : 'Signing in'}</>) : 'Continue'}
          </button>

          {/* Supabase error / success strip. Same type scale as the old inline
              error, boxed with the semantic red/green so it stays subtle. */}
          {msg && (
            <div role={msg.kind === 'error' ? 'alert' : 'status'}
              style={{
                ...S.msgStrip,
                color: msg.kind === 'error' ? RED : GREEN,
                borderColor: msg.kind === 'error'
                  ? 'color-mix(in srgb, var(--red) 45%, transparent)'
                  : 'color-mix(in srgb, var(--green) 45%, transparent)',
                background: msg.kind === 'error'
                  ? 'color-mix(in srgb, var(--red) 8%, transparent)'
                  : 'color-mix(in srgb, var(--green) 8%, transparent)',
              }}>
              {msg.text}
            </div>
          )}

          {su && (
            !refReveal ? (
              <button className="paneLink" style={{ ...S.paneLink, marginTop: 10 }} onClick={() => setRefReveal(true)}>Referral code?</button>
            ) : (
              <input placeholder="Referral code" style={{ ...S.input, marginTop: 10, fontFamily: mono, letterSpacing: '1px' }}
                aria-label="Referral code" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} />
            )
          )}

          {su && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <label style={S.consentRow}>
                <span style={S.cbWrap}>
                  <input type="checkbox" className="cbInput" checked={agreeTos}
                    onChange={(e) => { setAgreeTos(e.target.checked); if (e.target.checked && msg?.kind === 'error') setMsg(null); }}
                    style={S.cbInput} aria-label="Agree to Terms of Service and Privacy Policy" />
                  <span style={{ ...S.cbBox, ...(agreeTos ? { background: BLUE_DEEP, borderColor: BLUE_DEEP } : (msg?.text.includes('Terms') ? { borderColor: RED } : null)) }} aria-hidden="true">
                    {agreeTos && (<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>)}
                  </span>
                </span>
                <span>I agree to the{' '}
                  <a className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 10.5, display: 'inline', textDecoration: 'none' }} href="https://b2web.site/terms" target="_blank" rel="noreferrer">Terms of Service</a>
                  {' '}and{' '}
                  <a className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 10.5, display: 'inline', textDecoration: 'none' }} href="https://b2web.site/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                </span>
              </label>
              <label style={S.consentRow}>
                <span style={S.cbWrap}>
                  <input type="checkbox" className="cbInput" checked={agreePromo}
                    onChange={(e) => setAgreePromo(e.target.checked)}
                    style={S.cbInput} aria-label="Consent to promotional emails" />
                  <span style={{ ...S.cbBox, ...(agreePromo ? { background: BLUE_DEEP, borderColor: BLUE_DEEP } : null) }} aria-hidden="true">
                    {agreePromo && (<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 7" /></svg>)}
                  </span>
                </span>
                <span>I consent to receiving promotional emails and product updates. You can opt out any time.</span>
              </label>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: MUTED, alignSelf: 'center' }}>
          {su ? 'Already have an account? ' : 'New here? '}
          <button className="paneLink" style={{ ...S.paneLink, marginTop: 0, fontSize: 11.5 }} onClick={flip}>
            {su ? 'Log in' : 'Create a free account'}
          </button>
        </div>
      </div>

      <div className="gateRight" style={S.gateRight}>
        <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, alignSelf: 'flex-start' }}>
          Live preview
        </div>
        <div style={S.snapWrap} aria-hidden="true">
          <div style={S.snapBar}>
            <span style={{ color: RED, fontWeight: 700 }}>b2web</span>
            <span style={{ marginLeft: 'auto', color: FAINT }}>San Francisco, CA</span>
          </div>
          <div style={S.snapHead}>
            <span style={{ flex: 2 }}>Business</span><span style={{ flex: 1, textAlign: 'right' }}>Reviews</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Stars</span><span style={{ flex: 1.4, textAlign: 'right' }}>Website</span>
          </div>
          {SNAP_ROWS.map((r, i) => (
            <div key={i} style={{ ...S.snapRow, background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              <span style={{ flex: 2, color: BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[0]}</span>
              <span style={{ flex: 1, textAlign: 'right', color: MUTED }}>{r[1]}</span>
              <span style={{ flex: 1, textAlign: 'right', color: MUTED }}>{r[2]}&#9733;</span>
              <span style={{ flex: 1.4, textAlign: 'right', color: r[3] === 'none' ? RED : AMBER, fontWeight: 700 }}>{r[3] === 'none' ? 'No website' : 'Social only'}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.55, maxWidth: 380 }}>
          Every row is a San Francisco business with no real website, verified and cached. {su ? 'Create an account' : 'Log in'} to unlock your own city and work the leads.
        </div>
      </div>
    </main>
  );
}

// ── live-preview rows (verbatim from the app's auth gate) ───────────────────
const SNAP_ROWS: [string, number, string, string][] = [
  ['Castro Classic Cuts', 34, '3.4', 'none'], ['Balboa Hot Pot', 214, '2.2', 'third'],
  ['Sunset Nails & Spa', 41, '3.5', 'none'], ['Mission Cut House', 47, '4.6', 'none'],
  ['Outer Sunset Fades', 8, '3.5', 'third'], ['Hayes Valley Hair Studio', 64, '4.4', 'none'],
  ['Clement Street Tailor', 16, '3.8', 'none'], ['North Beach Locksmith', 87, '4.4', 'third'],
  ['Portola Hardware', 51, '3.1', 'none'], ['Richmond Auto Care', 188, '4.3', 'none'],
];

// ── styles: copied verbatim from the app's S object ──────────────────────────
const S: Record<string, React.CSSProperties> = {
  gate: { position: 'fixed', inset: 0, zIndex: 80, background: BG, display: 'flex', fontFamily: ui, fontSize: 12, color: TEXT },
  gateLeft: { flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24, padding: '30px 48px 34px', overflowY: 'auto' },
  gateRight: { flex: '1 1 45%', background: PANEL, borderLeft: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 48px', textAlign: 'center', gap: 22 },

  brandBtn: { fontFamily: ui, fontSize: 14, fontWeight: 700, letterSpacing: '-0.3px', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  cancelBtn: { position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontFamily: ui, fontSize: 11, fontWeight: 600, color: MUTED, cursor: 'pointer', padding: '2px 5px', lineHeight: 1 },

  priBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, background: BLUE_DEEP, color: '#fff', border: `1px solid ${BLUE_DEEP}`, borderRadius: 2, padding: '7px 13px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: ui },
  outBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', color: TEXT, border: `1px solid ${RULE}`, borderRadius: 2, padding: '7px 13px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: ui },
  paneLink: { background: 'none', border: 'none', padding: 0, marginTop: 12, fontFamily: ui, fontSize: 11, color: BLUE, cursor: 'pointer', textAlign: 'left' },

  orRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 0', fontSize: 9.5, color: MUTED, letterSpacing: '0.6px', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' },
  orLine: { flex: 1, height: 1, background: LINE },
  fLabel: { fontFamily: mono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.7px', color: MUTED, fontWeight: 700, whiteSpace: 'nowrap' },
  input: { width: '100%', fontFamily: ui, fontSize: 12, padding: '9px 11px', border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, color: TEXT, boxSizing: 'border-box' },

  // New: the Supabase message strip. Type scale matches the old inline error;
  // border/background are the semantic status color at low opacity.
  msgStrip: { marginTop: 10, padding: '7px 10px', border: '1px solid', borderRadius: 2, fontSize: 10.5, lineHeight: 1.5, textAlign: 'left' },

  consentRow: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45, cursor: 'pointer' },
  cbWrap: { position: 'relative', width: 15, height: 15, flexShrink: 0, display: 'inline-flex' },
  cbInput: { position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' },
  cbBox: { width: 15, height: 15, boxSizing: 'border-box', border: `1px solid ${RULE}`, borderRadius: 2, background: PANEL2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },

  snapWrap: { width: '100%', maxWidth: 460, border: `1px solid ${RULE}`, borderRadius: 3, overflow: 'hidden', background: BG, fontFamily: mono, fontSize: 10.5, boxShadow: '0 14px 40px var(--shadow-strong)' },
  snapBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${LINE}`, fontSize: 10 },
  snapHead: { display: 'flex', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${LINE}`, color: MUTED, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 },
  snapRow: { display: 'flex', gap: 8, padding: '5px 10px', fontVariantNumeric: 'tabular-nums' },
};

// ── global CSS: the subset of the app's sheet this page uses, verbatim ───────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
  :root, html[data-theme="dark"] {
    --bg:#15181d; --panel:#1d2128; --panel-2:#232833; --sel:#272f3d;
    --line:#2c313c; --rule:#3e4554; --text:#d6dae2; --muted:#8a91a3; --faint:#586070;
    --red:#d64b42; --amber:#d6a243; --green:#57a85f; --blue:#5b96d6; --blue-deep:#2c66a8;
    --scrim:rgba(8,10,13,0.62); --shadow-strong:rgba(0,0,0,0.5);
    --border-hover:#4a5263; --btn-p-hover:#3372ba;
    color-scheme: dark;
  }
  html[data-theme="pitch"] {
    --bg:#000000; --panel:#07080c; --panel-2:#0d0f16; --sel:#141a26;
    --line:#14171f; --rule:#232936; --text:#d6dae2; --muted:#838a9c; --faint:#4d5566;
    --red:#d64b42; --amber:#d6a243; --green:#57a85f; --blue:#5b96d6; --blue-deep:#2c66a8;
    --scrim:rgba(0,0,0,0.8); --shadow-strong:rgba(0,0,0,0.78);
    --border-hover:#2e3645; --btn-p-hover:#3372ba;
    color-scheme: dark;
  }
  html[data-theme="light"] {
    --bg:#eef0f4; --panel:#ffffff; --panel-2:#e6e9ef; --sel:#d6e4f6;
    --line:#e2e5eb; --rule:#c6ccd6; --text:#1a1d23; --muted:#606873; --faint:#9aa1ad;
    --red:#c43d30; --amber:#9a6400; --green:#2a7d3a; --blue:#2f6fc0; --blue-deep:#2c66a8;
    --scrim:rgba(20,22,28,0.45); --shadow-strong:rgba(15,23,42,0.18);
    --border-hover:#aeb5c2; --btn-p-hover:#255f9e;
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${BG}; }
  button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 1px; }
  .cbInput:focus-visible { outline: none; }
  .cbInput:focus-visible + span { outline: 2px solid ${BLUE}; outline-offset: 1px; }
  .btnP:hover:not(:disabled) { background: var(--btn-p-hover); border-color: var(--btn-p-hover); }
  .btnP:disabled { opacity: 0.55; cursor: not-allowed; }
  .btnO:hover:not(:disabled) { background: ${PANEL2}; }
  .cancelBtn:hover { color: ${TEXT}; }
  input:focus { border-color: var(--blue-deep, ${BLUE}); }
  input::placeholder { color: ${FAINT}; }
  .paneLink:hover { text-decoration: underline; }
  svg.spin { animation: spin 700ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .shake { animation: shakeX 380ms cubic-bezier(.36,.07,.19,.97); }
  @keyframes shakeX {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-7px); }
    40%, 60% { transform: translateX(7px); }
  }
  @media (max-width: 860px) {
    .gateRight { display: none; }
  }
`;
