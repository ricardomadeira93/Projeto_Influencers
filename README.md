# macet.ai MVP

macet.ai turns one tutorial video (webcam + screen in a single recording) into vertical split-screen clips with captions and AI-suggested segments.

## Stack
- Frontend: Next.js App Router + TypeScript + Tailwind
- Backend: Next.js Route Handlers
- DB/Auth/Storage: Supabase
- Queue: DB-backed `jobs` table (`PENDING`, `UPLOADED`, `READY_TO_PROCESS`, `PROCESSING`, `DONE`, `FAILED`, `EXPIRED`)
- Worker: Local persistent Node worker (`worker/local-worker.ts`)
- AI providers: `stub` or local `faster_whisper` (`TRANSCRIBE_PROVIDER`) and Ollama (`SEGMENT_PROVIDER`)

## Core MVP features
- Signed upload URL flow
- Preset output formats (Instagram Reels, YouTube Shorts, TikTok, Instagram Feed)
- Split-screen vertical layout (Top webcam / Bottom screen)
- Stylized caption burn-in presets (`BOLD`, `CLEAN`, `MODERN`, `MINIMAL`)
- LLM clip suggestions with strict JSON schema
- Free-plan usage limit (default 60 minutes lifetime)
- TTL cleanup: uploads 24h, exports 72h (`/api/internal/cleanup`)
- Publish pack: MP4 + title/description/hashtags + platform upload shortcuts
- Optional phase 1.5 publish token scaffold (`publish_tokens`, feature flag)

## Environment variables
Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INTERNAL_CRON_SECRET=
TRANSCRIBE_PROVIDER=stub
TRANSCRIBE_LANGUAGE=pt
FASTER_WHISPER_MODEL=small
FASTER_WHISPER_COMPUTE_TYPE=int8
SEGMENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
AI_OUTPUT_LANGUAGE=pt-BR
CLIP_MIN_SECONDS=20
CLIP_TARGET_SECONDS=26
CLIP_MAX_SECONDS=30
CLIP_MAX_COUNT=3
CLIP_SELECTION_QUALITY=high
FFMPEG_BIN=ffmpeg
FREE_MINUTES_TOTAL=60
MAX_UPLOAD_DURATION=1800
# optional
FEATURE_DIRECT_PUBLISH=false
# optional transcription tuning for unstable hosts/timeouts
MAX_TRANSCRIBE_AUDIO_MB=20
TRANSCRIBE_CHUNK_SECONDS=45
```

## Local Worker
1. Install dependencies:
```bash
pnpm install
```
Then generate Prisma client:
```bash
pnpm prisma:generate
```
2. Install local processing dependencies:
```bash
brew install ffmpeg
brew install ollama
ollama pull qwen2.5:7b-instruct
pip3 install faster-whisper
```

If your default `ffmpeg` has no subtitle filters (`ass`/`subtitles`), install `ffmpeg-full` and point worker to it:
```bash
brew install ffmpeg-full
export FFMPEG_BIN=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
```

3. Apply SQL migration in Supabase SQL editor:
- `supabase/migrations/20260217_splitshorts_init.sql`
- `supabase/migrations/20260217_job_processing_telemetry.sql`

4. Create storage buckets:
```bash
pnpm setup:buckets
```

5. Run app:
```bash
pnpm dev
```

6. Run worker in a separate terminal:
```bash
pnpm worker:local
```

7. Optional single tick:
```bash
pnpm worker:local --once
```

## Job lifecycle
1. Client requests signed upload URL (`/api/upload/sign`) and pre-creates `jobs` row as `PENDING`.
2. Client uploads video directly to Supabase Storage at `uploads/{userId}/{jobId}.mp4`.
3. Client confirms upload (`PATCH /api/jobs/:jobId`) to set `UPLOADED`.
4. User clicks Generate, app sets `READY_TO_PROCESS`.
5. Local worker polls every few seconds, atomically claims one job as `PROCESSING`, and runs FFmpeg + AI providers.
6. Worker uploads outputs to `exports/{userId}/{jobId}/clip_N.mp4` and `exports/{userId}/{jobId}/clip_N.srt`.
7. Worker persists metadata in `job_exports` and marks job `DONE` (or `FAILED` on error).
8. Stale `PROCESSING` jobs are auto-recovered to `READY_TO_PROCESS` after timeout.

## Internal endpoints
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

## FFmpeg prerequisite
`ffmpeg` must be available in runtime PATH for local and production worker containers.
