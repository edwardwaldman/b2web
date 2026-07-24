This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Tiers

The screener has four tiers. Limits are configurable in `.env.example`.

| Tier  | Price   | Location | Businesses shown | Live crawl |
|-------|---------|----------|------------------|------------|
| Free  | —       | Their own (geolocated) | `FREE_ROWS` (5) | Their area only, `FREE_DAILY_CRAWLS`/day (1) |
| Pro   | $25/mo  | Their own | `PRO_ROWS` (20) | Their area only, `PRO_DAILY_CRAWLS`/day (3) |
| Ultra | $200/mo | **Any** location | Unlimited | Any location, one crawl every `ULTRA_COOLDOWN_MINUTES` (10) |
| Owner | —       | Any | Unlimited | Uncapped. Password-gated operator/QA mode (`ADMIN_SECRET`) |

Live crawls are **session-verified** (real profile tier) before spending any
Google budget; a cache hit never counts against a tier's limit, and the global
`GOOGLE_PLACES_DAILY_BUDGET` still hard-caps total spend. Logged-out visitors
can't crawl — detecting a location sends them to signup.

The bottom-right **TEST** switch (unlocked with the owner password) previews each
tier — Free / Pro / Ultra / Owner — with that tier's real limits and row caps.

## Real ads (Google AdSense)

The in-feed and business-page ad spaces render **real AdSense units** for
free-tier visitors once configured; every paid tier is ad-free. To go live, set
`NEXT_PUBLIC_ADSENSE_CLIENT` (your `ca-pub-…` id) and at least
`NEXT_PUBLIC_ADSENSE_SLOT_INFEED` (see `.env.example`). `/ads.txt` is served
automatically from the client id. Until both are set, neutral placeholder boxes
stay in the ad spaces.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
