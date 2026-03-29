# Development Progress

## Snapshot Date
- 2026-03-03

## Current Stage
- MVP+ foundation complete for backend, caller/provider web app, and admin console.
- International-first (English-only) baseline is enforced in user-facing code/docs.

## Completed Work
- Repository bootstrap
  - Initialized Git repository and pushed `main` to `origin`.
  - Standardized Git identity to `moyaForHY <851929018@qq.com>`.

- Backend core (FastAPI)
  - Auth: register/login/me/reset-api-key.
  - Auth: send-email-verification/verify-email endpoints for email verification flow.
  - Dev bootstrap endpoint: `POST /v1/auth/bootstrap-admin` (dev/local only).
  - Skills: CRUD, list/search, invoke (`POST /v1/skills/{id}/call`).
  - Wallet: balance, transactions, recharge session.
  - Withdrawals: create/list/get and admin approval.
  - Stripe: webhook endpoint, connect onboarding/status, transfer path.
  - Admin APIs: users, metrics, skills, transactions, pending withdrawals.
  - Admin list endpoints standardized to paginated response shape (`items`, `page`, `page_size`, `total`).
  - Skill call endpoint now supports both JWT and API-key bearer credentials.
  - Account API key reset endpoint is wired and exposed in frontend account settings page.

- Core business logic
  - Skill call flow: schema validation, freeze credits, callback, output validation, settlement/refund.
  - Skill callback now supports configurable retry on timeout/network/5xx failures (`CALL_RETRY_MAX_ATTEMPTS`, `CALL_RETRY_BACKOFF_MS`).
  - Withdrawal flow: monthly frequency checks, duplicate-submit guard window, manual review threshold, success/failure handling.
  - Webhook idempotency behavior in recharge processing, including row-lock protection and transaction-level dedup fallback to reduce double-credit risk.

- Data & migration
  - SQLAlchemy models for agents/skills/wallets/transactions/calls/withdrawals/stripe_payments.
  - Alembic initialized with first migration: `0001_initial_schema`.
  - Added migration `0002_email_verification_fields` for agent email verification columns.
  - Docker compose startup command set to run `alembic upgrade head` before API boot.

- Frontend (caller/provider app)
  - Auth page (login/register), token persistence, guarded API calls.
  - Skills page: list + publish + invoke.
  - Wallet page: recharge, transactions, Stripe connect status/start, withdrawal request/list.
  - Calls page: call history.
  - Marketplace page: enhanced UI with filters, sorting, operational status indicators (busy/available with queue count), and SLA information.

- Deployment architecture
  - **Server**: 47.250.195.67 (SSH key: `/Users/ian/.ssh/tokenhub`)
  - **Domain**: https://www.agentcab.ai, https://agentcab.ai
  - **Project directory**: `/root/agenthub` (not `/root/agentcab`)
  - **Backend container**: `agenthub-backend-1` (not `agentcab-backend-1`)

  - **Frontend deployment** (Hybrid model: SSR + SPA):
    - **Nginx reverse proxy** (host machine, ports 80/443):
      - `/`, `/about`, `/api-docs` → Next.js SSR container (localhost:3000)
      - `/_next/`, `/_ssr/` → Next.js static assets (localhost:3000)
      - `/v1/` → Backend API (localhost:8000)
      - `/admin/` → Static admin files (/var/www/agentcab/admin/)
      - Other routes (e.g., `/marketplace`) → Static SPA files (/var/www/agentcab/frontend/)

  - **Frontend SPA deployment** (React SPA for `/marketplace`, `/skills`, etc.):
    - **Container architecture**: Static files served directly by nginx (no container)
    - **Deployment process**:
      1. Local build:
         ```bash
         cd frontend && npm run build
         ```
         (outputs to `frontend/dist/`)
      2. Upload to server:
         ```bash
         scp -i /Users/ian/.ssh/tokenhub -r frontend/dist/* root@47.250.195.67:/var/www/agentcab/frontend/
         ```
      3. No container restart needed (nginx serves static files directly)
    - **Important notes**:
      - Static files are served by nginx from `/var/www/agentcab/frontend/`
      - No container involved, changes take effect immediately
      - Make sure to build locally before uploading

  - **Frontend SSR deployment** (Next.js SSR for `/`, `/about`, `/api-docs`):
    - **Container architecture**: Next.js runs in Docker container `agenthub-frontend_ssr-1`
    - **Container name**: `agenthub-frontend_ssr-1`
    - **Source directory**: `/root/agenthub/frontend-next/`
    - **Deployment process**:
      1. Upload changed files to server filesystem:
         ```bash
         # Upload single file
         scp -i /Users/ian/.ssh/tokenhub frontend-next/app/about/page.tsx root@47.250.195.67:/root/agenthub/frontend-next/app/about/

         # Or upload entire directory
         scp -i /Users/ian/.ssh/tokenhub -r frontend-next/app/* root@47.250.195.67:/root/agenthub/frontend-next/app/
         ```
      2. Rebuild Docker image (IMPORTANT: must rebuild after code changes):
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "cd /root/agenthub && docker compose build frontend_ssr"
         ```
      3. Restart container with new image:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "cd /root/agenthub && docker compose up -d frontend_ssr"
         ```
      4. Verify deployment:
         ```bash
         # Check container status
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker ps --filter name=frontend_ssr"
         # Check logs
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker logs --tail 20 agenthub-frontend_ssr-1"
         # Test SSR page
         curl -s https://www.agentcab.ai/about | grep "How to Become a Provider"
         ```
    - **Important notes**:
      - Container does NOT mount source code (files are copied during Docker build)
      - MUST rebuild Docker image after any code changes
      - Use `docker compose` (V2), not `docker-compose` (V1)
      - Container name is `agenthub-frontend_ssr-1`
      - If you only upload files without rebuilding, changes won't take effect
      - Build process runs `npm run build` inside Docker, takes ~20 seconds

  - **Backend deployment**:
    - **Container architecture**: Backend container does NOT mount source code (files are copied during build)
    - **Container name**: `agenthub-backend-1`
    - **Source directory**: `/root/agenthub/backend/`
    - **Deployment process**:

      **Option 1: Hot-patch (Quick, for small changes)**
      1. Upload changed files to server filesystem:
         ```bash
         # Upload single file
         scp -i /Users/ian/.ssh/tokenhub backend/app/services/file.py root@47.250.195.67:/root/agenthub/backend/app/services/

         # Or upload multiple files
         scp -i /Users/ian/.ssh/tokenhub backend/app/api/v1/*.py root@47.250.195.67:/root/agenthub/backend/app/api/v1/
         ```
      2. Copy files into running container:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker cp /root/agenthub/backend/app/services/file.py agenthub-backend-1:/app/app/services/"
         ```
      3. Restart backend container to load new code:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker restart agenthub-backend-1"
         ```
      4. Verify deployment:
         ```bash
         # Check container status
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker ps --filter name=backend"
         # Check logs
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker logs --tail 20 agenthub-backend-1"
         # Test API
         curl -s https://www.agentcab.ai/v1/skills | jq '.data.items[0]'
         ```

      **Option 2: Full rebuild (Recommended for major changes)**
      1. Upload changed files to server filesystem:
         ```bash
         scp -i /Users/ian/.ssh/tokenhub -r backend/app/* root@47.250.195.67:/root/agenthub/backend/app/
         ```
      2. Rebuild Docker image:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "cd /root/agenthub && docker compose build backend"
         ```
      3. Restart container with new image:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "cd /root/agenthub && docker compose up -d backend"
         ```
      4. Verify deployment (same as Option 1 step 4)

      **Database migrations**:
      1. Upload migration file:
         ```bash
         scp -i /Users/ian/.ssh/tokenhub backend/alembic/versions/0004_*.py root@47.250.195.67:/root/agenthub/backend/alembic/versions/
         ```
      2. Copy into container:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker cp /root/agenthub/backend/alembic/versions/0004_*.py agenthub-backend-1:/app/alembic/versions/"
         ```
      3. Run migration:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker exec agenthub-backend-1 alembic upgrade head"
         ```
      4. Verify migration:
         ```bash
         ssh -i /Users/ian/.ssh/tokenhub root@47.250.195.67 "docker exec agenthub-backend-1 alembic current"
         ```
    - **Important notes**:
      - Container name is `agenthub-backend-1`, not `agentcab-backend-1`
      - Project directory is `/root/agenthub`, not `/root/agentcab`
      - Container does NOT mount source code (files are copied during build)
      - Use `docker compose` (V2), not `docker-compose` (V1)
      - **Hot-patch (Option 1)**: Fast, good for small changes, but changes are lost on container rebuild
      - **Full rebuild (Option 2)**: Slower (~30s), but changes persist in Docker image
      - Always restart container after code changes (hot-patch) or use `docker compose up -d` (rebuild)
      - Migrations run automatically on container startup, but can be run manually
      - For dependency changes (requirements.txt), must use full rebuild

  - **SDK/CLI deployment** (Python package published to PyPI):
    - **Package name**: `agentcab`
    - **PyPI URL**: https://pypi.org/project/agentcab/
    - **Source directory**: `/sdk/`
    - **Deployment process**:
      1. Update version in `setup.py`:
         ```python
         version="0.1.3",  # Increment version
         ```
      2. Build distribution packages:
         ```bash
         cd sdk
         python setup.py sdist bdist_wheel
         ```
         (outputs to `sdk/dist/`)
      3. Upload to PyPI:
         ```bash
         # Install twine if not already installed
         pip install twine

         # Upload to PyPI (requires PyPI credentials)
         twine upload dist/*
         ```
      4. Verify installation:
         ```bash
         # Install from PyPI
         pip install agentcab --upgrade

         # Test CLI
         agentcab --help

         # Test SDK
         python -c "from agentcab import ProviderClient, CallerClient; print('OK')"
         ```
    - **Important notes**:
      - Always increment version number before publishing
      - Cannot overwrite existing versions on PyPI
      - Clean `dist/` directory before building: `rm -rf dist/`
      - PyPI credentials required (stored in `~/.pypirc`)
      - Test installation in a fresh virtual environment before publishing
      - SDK includes both Provider and Caller functionality
      - CLI commands: `login`, `provider`, `call`, `wallet`

- Admin frontend
  - Admin login and token handling.
  - Dashboard metrics display.
  - User list.
  - Skills moderation (activate/deactivate).
  - Transaction list with filters.
  - Pending withdrawal approval.
  - Admin list states persisted in URL query params (view, filters, page, page_size).

- Testing & CI scaffolding
  - Unit tests for security utils, schema validation, Stripe payload parsing.
  - Added service/API-focused tests for withdrawal processing, bootstrap-admin guards, webhook idempotency.
  - Added call-service tests for settlement success, timeout refund, and callback-failure refund paths.
  - Added auth dependency tests for JWT path, API-key fallback, invalid credentials, and suspended-user rejection.
  - Added API tests for Stripe connect role/config branches and webhook invalid-event/error branches.
  - Added withdrawal API duplicate-submit guard test.
  - Added calls API permission tests (owner/admin read paths).
  - Added admin API tests for access control, pagination shape, and transaction-filter query paths.
  - Expanded admin API tests to cover skills filters and pending-withdrawal pagination/permission paths.
  - Added withdrawal-approval API tests for non-admin/pending/connect-ready/success branches.
  - Added skills API edge-case tests (owner/admin permission boundary and call `max_cost` guard).
  - Added wallet mock-recharge tests for permission rejection and already-processed path.
  - Added auth API tests for register/login error mapping and account self-read/reset-key paths.
  - Added email-verification tests for send/verify endpoints and auth service verification lifecycle.
  - Expanded Stripe connect API tests for Stripe-failure (502) branches.
  - Added withdrawal read API tests for not-found/permission/admin/list branches.
  - Local backend test run passes: 69 passed.
  - GitHub Actions workflow added: `.github/workflows/backend-tests.yml` (runs backend tests on push/PR).
  - GitHub Actions workflow added: `.github/workflows/web-builds.yml` (runs frontend/admin build checks on push/PR).

## Security/Quality Fixes Applied
- Blocked privilege escalation via registration role (`admin` cannot be self-registered).
- Added suspended-account check for API-key auth.
- Added optional login restriction for unverified accounts (`AUTH_REQUIRE_EMAIL_VERIFICATION`).
- Kept English-only output in app/docs for global-first release.

## E2E Testing Results (2026-03-03)
- ✅ **Production E2E test completed successfully** on https://www.agentcab.ai
- ✅ Authentication flow: login, JWT token generation
- ✅ Wallet API: balance query, credit management
- ✅ Skills API: list skills, retrieve skill details
- ✅ Skill call flow: input validation, execution, billing
- ✅ Billing system: credit deduction (50 credits per call), balance updates
- Test account: hy.moya@gmail.com (caller role)
- Initial balance: 1000 credits → After 2 calls: 900 credits

## Known Gaps / Next Priorities
- Add deeper integration tests (call settlement, refund edge cases, admin moderation paths).
- Wire real Stripe keys and webhook secret in environment for production-grade payment verification.
- Configure SMTP provider credentials (`EMAIL_SMTP_*`, `EMAIL_FROM_ADDRESS`) for production email delivery.
- Test provider workflow (create skill, receive calls, earn credits, withdraw).

## Operational Notes
- Docker CLI is installed, but Docker Desktop daemon startup can fail intermittently in this environment.
- Host runtime currently uses Python 3.9; backend annotations were made Python 3.9 compatible for local testability.
