# Digital Bullet Journal

Rust/Axum backend plus Vite/React frontend for the Bullet Journal app. Python backend and repair scripts have been replaced by one Rust binary that serves REST API, database migration tools, uploads, calendar feed, backups, and the built frontend.

## Quick Start

Migrate the old SQLite database first:

```bash
cargo run -- migrate-db --source bullet_journal.db --target bullet_journal_v2.db --dry-run
cargo run -- migrate-db --source bullet_journal.db --target bullet_journal_v2.db --force
```

Build the frontend:

```bash
cd frontend
npm ci
npm run build
cd ..
```

Run the Rust service on port `10001`:

```bash
cargo run -- serve
# or, after building release:
./rbullet-journal serve
```

Default service URL: `http://localhost:10001`.

- Frontend: `/`
- REST API: `/api/*`
- Uploads: `/static/uploads/*`

## Documentation

- [Current API](docs/api.md)
- [Frontend](docs/frontend.md)
- [Database migration and Future Log logic](docs/migration.md)
- [Testing](docs/testing.md)
- [Operations](docs/operations.md)

## Stack

- Backend: Rust, Axum, SQLx
- Frontend: React, Vite, TypeScript, Tailwind CSS, DaisyUI
- Database: SQLite
- Auth: bcrypt password hashes, HS256 JWT access/refresh/calendar tokens

## CLI

```bash
cargo run -- users list
cargo run -- users passwd <username> <new_password>
cargo run -- users delete <username>
```

## Environment

The service reads `.env` when present.

- `DATABASE_URL`: default `sqlite://bullet_journal_v2.db`
- `BIND_ADDR`: default `0.0.0.0:10001`
- `SECRET_KEY`: JWT and recovery-key secret
- `API_BASE_URL`: public origin used for upload URLs and calendar feed URLs, default `http://localhost:10001`
- `UPLOAD_DIR`: default `uploads`
- `FRONTEND_DIST`: default `frontend/dist`

`API_BASE_URL` should not include `/api`.
