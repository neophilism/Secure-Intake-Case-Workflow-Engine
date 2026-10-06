# Development

## Prerequisites
- Node.js 22+
- Docker with Compose

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run dev
```

Open http://localhost:3000. Health check: http://localhost:3000/api/health.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

## Pull request rule
Each milestone is delivered through a focused pull request. Core abstractions must remain reusable and must not encode one bill's terminology or workflow.
