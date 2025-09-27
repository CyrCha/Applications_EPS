This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Parent–Teacher Meetings (Doodle-like)

A simple, free-to-deploy multi-user app to organize parent–teacher meeting slots. Built with Next.js + Tailwind and Supabase (Postgres + Auth).

## Project Setup

1. Copy environment variables template:

   ```bash
   cp env.example .env.local
   ```

2. Create a free Supabase project at https://supabase.com/.

3. In Supabase Project Settings → API, copy:
   - Project URL → set `NEXT_PUBLIC_SUPABASE_URL`
   - anon public API key → set `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

5. Open http://localhost:3000

## Notes

- This app will later define tables and RLS policies in Supabase for events, time slots and bookings.
- Teachers authenticate via Supabase Auth (magic link); parents can reserve via a public link using an email.
- Deploy for free on Vercel; set the same env vars there.

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy on Vercel (with Supabase)

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Import the repo on https://vercel.com/ and select the Next.js framework preset.
3. In Vercel → Project Settings → Environment Variables, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. The public site will connect to your Supabase project.

## Troubleshooting

- If you see a console warning about Supabase env vars missing, ensure `.env.local` is present with correct values and restart `npm run dev`.
