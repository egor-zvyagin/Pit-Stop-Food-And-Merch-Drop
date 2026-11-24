# Pit Stop v2: Production Hardening, Architecture Unification & QA Master Plan

**Repository:** `egor-zvyagin/Pit-Stop-Food-And-Merch-Drop`  
**Branch:** `feat/v2-production-hardening`  
**Target AWS Account:** Profile `personal` (`608531435714`), Region `ap-southeast-2`  
**Live Production URL:** `https://main.d3m92lj3xoqgf9.amplifyapp.com`  
**Staff Kiosk URL:** `https://main.d3m92lj3xoqgf9.amplifyapp.com/vendor` (PIN: not published)  
**Cost Profile:** 100% Serverless / Scale-to-Zero ($0.00 idle cost)  

---

## Swarm Roster & File Ownership Map

| Worker | Roster Name | Domain & Ownership Boundary | Status |
|---|---|---|---|
| **Coordinator** | `coordinator` | Swarm orchestration, types consolidation, integration gates, deployment prep | Complete |
| **Worker 1** | `crypto-sec` | `frontend/src/lib/crypto/**`, `frontend/src/lib/auth/**`, `frontend/src/app/api/crypto/**`, `frontend/next.config.mjs` | Complete |
| **Worker 2** | `backend-data` | `frontend/src/lib/pricing.ts`, `frontend/src/lib/db/**`, `frontend/src/data/**`, `frontend/src/app/api/orders/**`, `frontend/src/app/api/inventory/**`, `frontend/src/app/api/stations/**`, `frontend/src/app/api/auth/**`, `frontend/src/app/api/payment/**`, `frontend/src/app/api/rewards/**`, `frontend/src/scripts/seed.ts` | Complete |
| **Worker 3** | `frontend-ux` | `frontend/src/app/**` (pages & layout only), `frontend/src/components/**`, `frontend/src/context/**`, `frontend/public/manifest.json` | Complete |
| **Worker 4** | `infra-devops` | `infra/terraform/**`, `.github/workflows/**`, `amplify.yml`, `frontend/public/sw.js` | Complete |
| **Worker 5** | `qa-verifier` | `frontend/src/__tests__/**`, `frontend/vitest.config.ts`, `frontend/e2e/**`, `frontend/src/scripts/smokeLive.ts`, `README.md`, `DEPLOYMENT_GUIDE.md` | Complete |
| **Monitor** | `monitor-2` | Native swarm stall detection and recovery | Complete |

---

## Live Progress Checklist

### Phase 0: Coordinator Setup
- [x] Verify git remote isolation strictly to `egor-zvyagin/Pit-Stop-Food-And-Merch-Drop.git`
- [x] Create feature branch `feat/v2-production-hardening`
- [x] Author canonical shared types in `frontend/src/lib/types.ts`
- [x] Author master tracker `IMPLEMENTATION_PLAN_V2.md`

### Track 1: `@crypto-sec` (Isomorphic Crypto & API Security)
- [x] Install `@noble/curves` for pure browser-safe Ed25519 cryptography
- [x] Split `passEngine.ts` into `passSigner.ts` (Node server only) and `passVerifier.ts` (isomorphic browser-safe)
- [x] Expose `GET /api/crypto/public-key` with immutable/long cache headers
- [x] Implement `OfflineNonceRegistry` (`localStorage` cache) & DynamoDB replay detection
- [x] Implement vendor kiosk PIN auth guard (`src/lib/auth/vendorAuth.ts`) with `X-Vendor-Pin`
- [x] Restrict CORS in `frontend/next.config.mjs` to `NEXT_PUBLIC_APP_URL` and `localhost:3000`

### Track 2: `@backend-data` (Catalog, Authoritative Pricing, Payment & Persistent Rewards)
- [x] Consolidate unified catalog in `src/data/catalog.ts` with real `/images/*.jpg` paths
- [x] Implement deterministic `src/lib/pricing.ts` (`calculateOrderPricing`)
- [x] Harden `POST /api/orders` against client unitPrice tampering; generate `orderId` (`GP-2026-...`) & 4-digit `pinCode`
- [x] Implement payment idempotency in `POST /api/payment/checkout`
- [x] Wire DynamoDB persistent rewards endpoints: `GET /api/rewards`, `POST /api/rewards/redeem`, `POST /api/rewards/award`
- [x] Auto-award rewards points on `PATCH /api/orders/[id]/status` (`COMPLETED`)
- [x] Eliminate scans in `client.ts` via GSI1/GSI2; add DynamoDB TTL (7 days) on orders
- [x] Update `seed.ts` with unified catalog, 4 stations, demo tickets (`GP-3820-X`, `GP-9014-P`), and sample orders

### Track 3: `@frontend-ux` (Architecture Cleanup, Real-Time Sync & Kiosk Terminal)
- [x] Purge dead legacy prototype files (`CartContext.tsx`, `CartDrawer.tsx`, `Header.tsx`, `LocationBar.tsx`, etc.)
- [x] Implement route-aware shell in `AppShell.tsx` (fullscreen kiosk mode on `/vendor`)
- [x] Wire live inventory API & product photography on `/order`
- [x] Connect checkout flow to `calculateOrderPricing()` and real payment/order endpoints with inline error handling
- [x] Make `AppHeader.tsx` ticket badge interactive with Ticket Verification modal & demo ticket quick-fill
- [x] Mount automatic order status polling on `/collect` and `/pass` with visibility change handling
- [x] Upgrade `/vendor` kiosk with Staff PIN gate, camera QR scanning, offline verifier, and status actions

### Track 4: `@infra-devops` (Terraform S3 Locking, DynamoDB GSI2/TTL & PWA)
- [x] Add GSI2 and TTL configuration to `infra/terraform/dynamodb.tf`
- [x] Document Terraform 1.11+ S3 native state locking (`use_lockfile = true`) in `backend.tf.example`
- [x] Upgrade terraform version to `1.11.4` in GitHub Actions workflows
- [x] Add budget alert module in `budgets.tf` (optional $5/mo guardrail)
- [x] Add `manifest.json` and PWA metadata in `layout.tsx`

### Track 5: `@qa-verifier` (Vitest Suite, E2E Verification & Portfolio Docs)
- [x] Configure `vitest` in `frontend/package.json`
- [x] Expand unit & integration test suites (crypto offline latency <10ms, pricing parity, API contracts, auth rejection)
- [x] Build end-to-end user-to-vendor scenario script
- [x] Add `frontend/src/scripts/smokeLive.ts` (`npm run test:live`)
- [x] Update `README.md` and `DEPLOYMENT_GUIDE.md` with v2 architecture diagrams and demo credentials

### Phase Final: Coordinator Integration & Verification Gate
- [x] Run `npm run lint` (0 warnings/errors)
- [x] Run `npx tsc --noEmit` (0 type errors)
- [x] Run `npm test` (30/30 tests passing)
- [x] Run `npm run test:live` (6/6 smoke steps in 17ms)
- [x] Run `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="" npm run build` (18/18 routes compiling)
- [x] Run `terraform fmt -check && terraform validate` (valid configuration)
- [x] Verify local runtime tamper-resistance & offline verification
- [x] Document final release and deployment instructions
