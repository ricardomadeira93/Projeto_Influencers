# SplitShorts MVP

SplitShorts turns one tutorial video (webcam + screen in a single recording) into vertical split-screen clips with captions and AI-suggested segments.

## Stack
- Frontend: Next.js App Router + TypeScript + Tailwind
- Backend: Next.js Route Handlers
- DB/Auth/Storage: Supabase
- Queue: DB-backed `jobs` table (`PENDING`, `UPLOADED`, `PROCESSING`, `DONE`, `FAILED`, `EXPIRED`)
- Worker: FFmpeg + OpenAI Whisper + GPT suggestions (`src/worker`)

## Core MVP features
- Signed upload URL flow
- Manual webcam crop config
- Split-screen vertical layout (Top webcam / Bottom screen)
- Caption burn-in presets (`BOLD`, `CLEAN`)
- LLM clip suggestions with strict JSON schema
- Free-plan usage limit (default 60 minutes lifetime)
- TTL cleanup: uploads 24h, exports 72h (`/api/internal/cleanup`)
- Publish pack: MP4 + title/description/hashtags + platform upload shortcuts
- Optional phase 1.5 publish token scaffold (`publish_tokens`, feature flag)

## Environment variables
Create `.env.local` from `.env.example`:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
INTERNAL_CRON_SECRET=
FREE_MINUTES_TOTAL=60
MAX_UPLOAD_DURATION=1800
# optional
FEATURE_DIRECT_PUBLISH=false
```

## Local setup
1. Install dependencies:
```bash
npm install
```
Then generate Prisma client:
```bash
npm run prisma:generate
```
2. Apply SQL migration in Supabase SQL editor:
- `supabase/migrations/20260217_splitshorts_init.sql`

3. Create storage buckets:
```bash
npm run setup:buckets
```

4. Run app:
```bash
npm run dev
```

5. Run worker in separate process:
```bash
npm run worker
```

6. Optional single worker tick:
```bash
npm run worker:once
```

## Job lifecycle
1. Client requests signed upload URL (`/api/upload/sign`) and pre-creates `jobs` row as `PENDING`.
2. Client uploads video directly to Supabase Storage.
3. Client confirms upload (`PATCH /api/jobs/:jobId`) to set `UPLOADED`.
4. Worker claims next `UPLOADED` job, sets `PROCESSING`.
5. Worker transcribes (Whisper), asks GPT for JSON segments, renders clips with FFmpeg, uploads to exports bucket.
6. Worker inserts `job_exports`, marks job `DONE` or `FAILED`.
7. Cleanup endpoint expires source uploads and old exports.

## Internal endpoints
- `POST /api/internal/worker-tick` (secret header `x-internal-secret`)
- `POST /api/internal/cleanup` (secret header `x-internal-secret`)

Example cron call:
```bash
curl -X POST http://localhost:3000/api/internal/cleanup -H "x-internal-secret: $INTERNAL_CRON_SECRET"
```

## Product + collaborator scope included
- Personas and scripts: `docs/product-stories.md`
- Content hooks and hashtag templates: `docs/content-templates.md`
- Market research, landing copy, onboarding, recruiting: `docs/go-to-market.md`
- Early testing protocol and feedback flow: `docs/user-testing.md`
- Team role ownership: `docs/team-roles.md`
- SEO implementation notes: `docs/seo.md`

## Publication integration plan
### Phase 1 (MVP)
Manual publish pack only:
- Download MP4
- Copy metadata pack
- Open provider upload pages (YouTube, TikTok, Instagram, X)

### Phase 1.5 (scaffold only)
- `publish_tokens` table exists
- `/api/publish/scaffold` endpoint exists
- `FEATURE_DIRECT_PUBLISH` gate included
- No direct publish API calls in MVP

## Free-tier deployment notes
### Option A: Vercel + Supabase (quickest)
- Deploy Next.js app on Vercel free tier.
- Add all env vars in Vercel project settings.
- Use Vercel Cron or external cron to call cleanup and worker tick endpoints.
- Best for low traffic and short jobs.

### Option B: Split worker when scale grows
- Keep API/UI on Vercel.
- Move worker process to cheap VPS or Cloud Run job.
- Worker runs `npm run worker` continuously.
- Keeps API latency stable while processing grows.

## FFmpeg prerequisite
`ffmpeg` must be available in runtime PATH for local and production worker containers.
