# Repository Guidelines

## Project Structure & Module Organization

This is the StickLink Golf pilot. Astro pages live in `src/pages/`, shared layouts and styles in `src/layouts/` and `src/styles/`, and domain logic in `src/lib/`. Static brand assets, artwork, video, and crawler files are under `public/`. The Cloudflare Worker API is in `worker/src/`, with configuration in `worker/wrangler.jsonc`. Ordered D1 migrations are in `migrations/`; product and architecture notes are in `docs/`; unit tests are in `tests/`.

## Build, Test, and Development Commands

Use Node/npm from the repository root:

- `npm run dev` starts the Astro development server.
- `npm run build` creates the static production build in `dist/`.
- `npm run check` runs Astro’s diagnostics and TypeScript checks for the site.
- `npm test` runs all `tests/**/*.test.ts` files with Node’s built-in test runner.
- `npm run api:dev` starts the Worker API locally with the repository’s Wrangler config.
- `npm run api:check` type-checks the Worker without emitting files.
- `npm run api:types` regenerates Worker binding types after configuration changes.

Do not commit generated directories such as `dist/`, `.astro/`, or `.wrangler/`.

## Coding Style & Naming Conventions

Use TypeScript and Astro components with two-space indentation, semicolons, and single-quoted strings, matching the existing code. Use `camelCase` for functions and variables, `PascalCase` for types/components, and kebab-case for route directories. Keep golf domain rules deterministic and separate official facts, advisory interpretation, and unverified observations. Validate inputs at API boundaries and preserve organization/league privacy boundaries.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`, with files named `<area>.test.ts` (for example, `network.test.ts`). Add focused regression coverage for geometry validation, scoring/league rules, API behavior, and provenance or authorization boundaries. Run `npm test`, `npm run check`, and `npm run api:check` before opening a pull request.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects such as `Refine golf pitch opening and operator services`. Keep commits focused and avoid staging unrelated work. Pull requests should explain the user-facing or API change, identify affected routes/modules or migrations, list validation commands run, and include screenshots for visual changes. Call out any required Wrangler, D1, or environment configuration separately; never include credentials.

## Security & Configuration

Use placeholders in `.env.example`; keep real secrets in ignored local files or Cloudflare secret storage. The current build uses local mock data and does not imply production tracking, payments, wagering, or sponsor attribution. Treat migrations and deployment as explicit reviewed operations, and use `npx wrangler` with the project config for Cloudflare work.
