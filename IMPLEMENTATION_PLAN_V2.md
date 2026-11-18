# Pit Stop v2: Production Hardening, Architecture Unification & QA Master Plan

**Repository:** `egor-zvyagin/Pit-Stop-Food-And-Merch-Drop`  
**Branch:** `feat/v2-production-hardening`  
**Target AWS Account:** Profile `personal` (`608531435714`), Region `ap-southeast-2`  
**Live Production URL:** `https://main.d3m92lj3xoqgf9.amplifyapp.com`  
**Cost Profile:** 100% Serverless / Scale-to-Zero ($0.00 idle cost)  

---

## Swarm Roster & File Ownership Map

| Worker | Roster Name | Domain & Ownership Boundary |
|---|---|---|
| **Coordinator** | `coordinator` | Swarm orchestration, types consolidation, integration gates, deployment prep |
| **Worker 1** | `crypto-sec` | `frontend/src/lib/crypto/**`, `frontend/src/lib/auth/**`, `frontend/src/app/api/crypto/**`, `frontend/next.config.mjs` |
| **Worker 2** | `backend-data` | `frontend/src/lib/pricing.ts`, `frontend/src/lib/db/**`, `frontend/src/data/**`, `frontend/src/app/api/orders/**`, `frontend/src/app/api/inventory/**`, `frontend/src/app/api/stations/**`, `frontend/src/app/api/auth/**`, `frontend/src/app/api/payment/**`, `frontend/src/app/api/rewards/**`, `frontend/src/scripts/seed.ts` |
| **Worker 3** | `frontend-ux` | `frontend/src/app/**` (pages & layout only), `frontend/src/components/**`, `frontend/src/context/**`, `frontend/public/manifest.json` |
| **Worker 4** | `infra-devops` | `infra/terraform/**`, `.github/workflows/**`, `amplify.yml`, `frontend/public/sw.js` |
| **Worker 5** | `qa-verifier` | `frontend/src/__tests__/**`, `frontend/vitest.config.ts`, `frontend/e2e/**`, `frontend/src/scripts/smokeLive.ts`, `README.md`, `DEPLOYMENT_GUIDE.md` |
| **Monitor** | `monitor` | Native swarm stall detection and recovery |

---

## Live Progress Checklist

### Phase 0: Coordinator Setup
- [x] Verify git remote isolation strictly to `egor-zvyagin/Pit-Stop-Food-And-Merch-Drop.git`
- [x] Create feature branch `feat/v2-production-hardening`
- [x] Author canonical shared types in `frontend/src/lib/types.ts`
- [x] Author master tracker `IMPLEMENTATION_PLAN_V2.md`

### Track 1: `@crypto-sec` (Isomorphic Crypto & API Security)
- [ ] Install `@noble/curves` for pure browser-safe Ed25519 cryptography
- [ ] Split `passEngine.ts` into `passSigner.ts` (Node server only) and `passVerifier.ts` (isomorphic browser-safe)
- [ ] Expose `GET /api/crypto/public-key` with immutable/long cache headers
- [ ] Implement `OfflineNonceRegistry` (`localStorage` cache) & DynamoDB replay detection
- [ ] Implement vendor kiosk PIN auth guard (`src/lib/auth/vendorAuth.ts`) with `X-Vendor-Pin` (`2026`)
- [ ] Restrict CORS in `frontend/next.config.mjs` to `NEXT_PUBLIC_APP_URL` and `localhost:3000`

### Track 2: `@backend-data` (Catalog, Authoritative Pricing, Payment & Persistent Rewards)
- [ ] Consolidate unified catalog in `src/data/catalog.ts` with real `/images/*.jpg` paths
- [ ] Implement deterministic `src/lib/pricing.ts` (`calculateOrderPricing`)
- [ ] Harden `POST /api/orders` against client unitPrice tampering; generate `orderId` (`GP-2026-...`) & 4-digit `pinCode`
- [ ] Implement payment idempotency in `POST /api/payment/checkout`
- [ ] Wire DynamoDB persistent rewards endpoints: `GET /api/rewards`, `POST /api/rewards/redeem`, `POST /api/rewards/award`
- [ ] Auto-award rewards points on `PATCH /api/orders/[id]/status` (`COMPLETED`)
- [ ] Eliminate scans in `client.ts` via GSI1/GSI2; add DynamoDB TTL (7 days) on orders
- [ ] Update `seed.ts` with unified catalog, 4 stations, demo tickets (`GP-3820-X`, `GP-9014-P`), and sample orders

### Track 3: `@frontend-ux` (Architecture Cleanup, Real-Time Sync & Kiosk Terminal)
- [ ] Purge dead legacy prototype files (`CartContext.tsx`, `CartDrawer.tsx`, `Header.tsx`, `LocationBar.tsx`, etc.)
- [ ] Implement route-aware shell in `AppShell.tsx` (fullscreen kiosk mode on `/vendor`)
- [ ] Wire live inventory API & product photography on `/order`
- [ ] Connect checkout flow to `calculateOrderPricing()` and real payment/order endpoints with inline error handling
- [ ] Make `AppHeader.tsx` ticket badge interactive with Ticket Verification modal & demo ticket quick-fill
- [ ] Mount automatic order status polling on `/collect` and `/pass` with visibility change handling
- [ ] Upgrade `/vendor` kiosk with Staff PIN gate (`2026`), camera QR scanning, offline verifier, and status actions

### Track 4: `@infra-devops` (Terraform S3 Locking, DynamoDB GSI2/TTL & PWA)
- [ ] Add GSI2 and TTL configuration to `infra/terraform/dynamodb.tf`
- [ ] Document Terraform 1.11+ S3 native state locking (`use_lockfile = true`) in `backend.tf.example`
- [ ] Upgrade terraform version to `1.11.4` in GitHub Actions workflows
- [ ] Add budget alert module in `budgets.tf` (optional $5/mo guardrail)
- [ ] Add `manifest.json` and PWA metadata in `layout.tsx`

### Track 5: `@qa-verifier` (Vitest Suite, E2E Verification & Portfolio Docs)
- [ ] Configure `vitest` in `frontend/package.json`
- [ ] Expand unit & integration test suites (crypto offline latency <10ms, pricing parity, API contracts, auth rejection)
- [ ] Build end-to-end user-to-vendor scenario script
- [ ] Add `frontend/src/scripts/smokeLive.ts` (`npm run test:live`)
- [ ] Update `README.md` and `DEPLOYMENT_GUIDE.md` with v2 architecture diagrams and demo credentials

### Phase Final: Coordinator Integration & Verification Gate
- [ ] Run `npm run lint` (0 warnings/errors)
- [ ] Run `npx tsc --noEmit` (0 type errors)
- [ ] Run `npm test` (all tests passing)
- [ ] Run `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="" npm run build` (all routes compiling)
- [ ] Run `terraform fmt -check && terraform validate`
- [ ] Verify local runtime tamper-resistance & offline verification
- [ ] Document final release and deployment instructions
