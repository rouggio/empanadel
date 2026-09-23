# Empanadel — Tennis & Padel Court Booking

> Spec: [`SPEC.md`](./SPEC.md) (v0.1.3) · Stack: Fastify + TypeScript + Drizzle + PostgreSQL · Frontend: Vite + Alpine.js + Tailwind · Deploy: Render.com single Web Service (API serves `frontend/dist`)

## Quick start (local)

```bash
# 1. DB
docker compose up -d db
# or: docker-compose up -d db

# 2. Backend
cd backend
cp .env.example .env
npm ci
npm run generate  # drizzle-kit generate (first time)
npm run migrate   # apply migrations
npm run dev       # http://localhost:3000  (GET /health, /api/*)

# 3. Frontend (separate terminal)
cd frontend
npm ci
npm run dev       # http://localhost:5173  (proxies /api → :3000)
```

Build for production (what Render does):

```bash
npm ci --prefix backend && npm run build --prefix backend
npm ci --prefix frontend && npm run build --prefix frontend
npm run migrate --prefix backend && npm start --prefix backend  # serves frontend/dist
```

## Render deploy

Blueprint at [`render.yaml`](./render.yaml): single Web Service `empanadel-api` + PostgreSQL 16 `empanadel-db`. Push to `main` → auto-deploy. Health check `GET /health`.

## Project layout

See `SPEC.md:506` — `backend/src/**/*.ts` (Fastify + Drizzle + JWT + `@fastify/static`), `frontend/` (Vite + Alpine), `render.yaml`, `docker-compose.yml` (local only).
