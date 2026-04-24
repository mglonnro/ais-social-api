# ais-social-api TODO

## AI top-down boat icons
Plan: `~/.claude/plans/ok-i-have-a-quirky-kay.md`

- [ ] Add deps: `@google/genai`, `sharp`.
- [ ] Migration `migrations/0002_boats_topdown.sql` — add `topdown_uri`, `topdown_length_m`, `topdown_beam_m` to `boats`.
- [ ] New `gemini.mjs` — `generateTopdown(photoBuffers, lengthM, beamM)` wrapping `gemini-3.1-flash-image-preview` at 512 px.
- [ ] New `topdown.mjs` — fetches AIS dimensions (via `ais.js`), downloads media, calls Gemini, crops/resizes to real aspect ratio at 128 px longest edge via sharp, uploads to GCS `images/topdown/<mmsi>.png`.
- [ ] Extend `fb.mjs` to upload in-memory buffers to arbitrary destination paths.
- [ ] `auth/token.mjs` — add `isAdmin(userId)` backed by `ADMIN_USER_IDS` env var.
- [ ] New admin route `POST /admin/boats/:mmsi/generate-topdown` in `server.js`. Responses: 404 / 422 (no dimensions) / 200.
- [ ] Expose `topdown_uri / topdown_length_m / topdown_beam_m` in `GET /boats/:mmsi`.
- [ ] Set `GEMINI_API_KEY` in prod/beta env.
- [ ] Verification: see plan file.
