---
name: esbuild __dirname path resolution
description: How __dirname resolves in the api-server esbuild bundle, and the correct relative paths for public/scripts dirs.
---

The api-server uses esbuild with a banner that sets:
  `globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))`

The compiled bundle output is at `artifacts/api-server/dist/index.mjs`, so `__dirname` = `artifacts/api-server/dist/`.

**Correct relative paths from `__dirname` in compiled code:**
- `../public`   → `artifacts/api-server/public/` ✅ (clips, uploads served here)
- `../scripts/` → `artifacts/api-server/scripts/` ✅ (transcribe.py, fetch_transcript.py)

**Wrong (do NOT use):**
- `../../public`   → `artifacts/public/` ❌ (clips saved to wrong place, 404 on serve)
- `../../scripts/` → `artifacts/scripts/` ❌

**Why:** esbuild bundles everything into a single dist/index.mjs — the source file depth (`src/lib/`) is gone after bundling. Always count `..` from `dist/`, not from `src/lib/`.

app.ts correctly uses `../public` for static serving — all other files must match.
