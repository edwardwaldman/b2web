'use client';

// m/MobileScreener.jsx — compact mobile navigation for the screener
// ─────────────────────────────────────────────────────────────────────────────
// The desktop header cluster (alerts, lists, About, Help, theme, auth) hands
// off to this on small screens. A 44x44 hamburger sits inside the existing
// top bar row — zero extra vertical real estate — and opens a slim slide-in
// panel of dense 44px rows. The panel is an overlay, so the screener table
// keeps every pixel of height it has on desktop.
//
// Self-contained: owns its open state, Esc-to-close, backdrop dismiss, body
// scroll lock, and focus handling. The host passes `items`, an array of
//   { key, label, hint?, accent?, onClick, kind?: "item" | "heading" | "divider" }
// so all real behavior stays in the page that owns the state. Every item
// click closes the panel first, then runs the handler — anchored popovers a
// handler opens are positioned against the viewport, not the dead menu row.
//
// Styling matches the app's design system through its CSS vars (--panel,
// --line, --text, ...) with dark-slate fallbacks, and hides itself entirely
// above 768px, where the desktop header takes back over.

import React, { useEffect, useRef, useState } from 'react';

export default function MobileScreener({ label = 'Menu', items = [] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  // Esc closes and hands focus back to the burger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // The page behind the overlay must not scroll while the panel is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Keyboard users land on the first row, not behind the scrim.
  useEffect(() => {
    if (open) panelRef.current?.querySelector('button')?.focus();
  }, [open]);

  const run = (item) => (e) => {
    setOpen(false);
    item.onClick?.(e);
  };

  return (
    <div className="mnav">
      <button
        ref={btnRef}
        className="mnavBtn"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mnav-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open
            ? <path d="M6 6l12 12M18 6L6 18" />
            : <path d="M3.5 6h17M3.5 12h17M3.5 18h17" />}
        </svg>
      </button>

      {open && <div className="mnavScrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <nav
        id="mnav-panel"
        ref={panelRef}
        className={`mnavPanel${open ? ' on' : ''}`}
        aria-label={label}
        aria-hidden={!open}
      >
        {items.map((it, i) =>
          it.kind === 'heading' ? (
            <div key={it.key || i} className="mnavHead">{it.label}</div>
          ) : it.kind === 'divider' ? (
            <div key={it.key || i} className="mnavRule" aria-hidden="true" />
          ) : (
            <button key={it.key || i} className={`mnavItem${it.accent ? ' accent' : ''}`} onClick={run(it)}>
              <span className="mnavLabel">{it.label}</span>
              {it.hint ? <span className="mnavHint">{it.hint}</span> : null}
            </button>
          ),
        )}
      </nav>

      <style>{MNAV_CSS}</style>
    </div>
  );
}

const MNAV_CSS = `
  .mnav { display: none; }
  @media (max-width: 768px) {
    .mnav { display: inline-flex; align-items: center; }
  }
  .mnavBtn {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 44px; min-height: 44px; padding: 0;
    background: none; border: 1px solid var(--rule, #3e4554); border-radius: 2px;
    color: var(--text, #d6dae2); cursor: pointer;
  }
  .mnavScrim { position: fixed; inset: 0; z-index: 118; background: var(--scrim, rgba(8,10,13,0.62)); }
  .mnavPanel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 119;
    width: min(80vw, 300px);
    display: flex; flex-direction: column;
    background: var(--panel, #1d2128); border-left: 1px solid var(--line, #2c313c);
    box-shadow: -16px 0 40px var(--shadow-strong, rgba(0,0,0,0.5));
    overflow-y: auto; padding: 4px 0 calc(8px + env(safe-area-inset-bottom));
    visibility: hidden; transform: translateX(100%);
    transition: transform 160ms ease, visibility 160ms;
  }
  .mnavPanel.on { visibility: visible; transform: none; }
  .mnavItem {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    min-height: 44px; width: 100%; padding: 0 14px; flex-shrink: 0;
    background: none; border: none; border-bottom: 1px solid var(--line, #2c313c);
    color: var(--text, #d6dae2); font: inherit; font-size: 12.5px; font-weight: 600;
    text-align: left; cursor: pointer;
  }
  .mnavItem:hover, .mnavItem:active { background: var(--panel-2, #232833); }
  .mnavItem.accent { background: var(--blue-deep, #2c66a8); color: #fff; border-bottom-color: transparent; }
  .mnavItem.accent:hover, .mnavItem.accent:active { background: var(--btn-p-hover, #3372ba); }
  .mnavLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mnavHint {
    flex-shrink: 0; font-size: 9px; font-weight: 700; letter-spacing: 0.6px;
    text-transform: uppercase; color: var(--muted, #8a91a3);
    border: 1px solid var(--line, #2c313c); border-radius: 2px; padding: 2px 5px;
  }
  .mnavHead {
    padding: 12px 14px 4px; flex-shrink: 0;
    font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
    color: var(--muted, #8a91a3);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mnavRule { height: 1px; flex-shrink: 0; background: var(--rule, #3e4554); margin: 4px 0; }
  @media (prefers-reduced-motion: reduce) {
    .mnavPanel { transition: none; }
  }
`;
