# Pit Stop: Food & Merch Drop — Master Implementation Plan & Architecture Specification

**Project:** Australian Grand Prix Corporation (AGPC) Fan Experience Innovation  
**Repository:** `egor-zvyagin/Pit-Stop-Food-And-Merch-Drop` (Personal Fork)  
**Target Cloud Deployment:** Personal AWS Account (`ap-southeast-2` Sydney)  
**Target Cost Profile:** \$0.00 – \$2.00/month idle (100% Serverless / Scale-to-Zero)  
**Status:** Complete & Verified • All Phases (1–4) Implemented, Tested & Pushed to Main  

---

## Executive Summary & Architectural Audit

The **Pit Stop: Food & Merch Drop** platform is an enterprise-grade mobile fan engagement and high-density race-day concession logistics application engineered for the Formula 1® Australian Grand Prix at Albert Park, Melbourne.

A deep forensic audit of the repository reveals that the project’s capabilities and assets are currently split across three distinct git branches and directories:
1. **`main` (Root):** Contains the project documentation (`README.md`), the standalone Ed25519 cryptographic benchmark engine (`crypto-poc/`), and the unpopulated initial create-next-app boilerplate directory (`pit-stop-food-and-merch-drop/`).
2. **`origin/develop`:** Contains the 5-page fan application layout (`frontend/`): Home (`/`), Order (`/order`), Checkout (`/checkout`), Collect (`/collect`), and Rewards (`/rewards`), accompanied by the Mapbox GL interactive circuit map, `OrderProvider`, and `RewardsProvider`. However, all data is in-memory mock state with client-side `setTimeout` simulations, order placement is gated behind demo mode, and the collection QR code is a static mockup PNG.
3. **`origin/feature/UI_prototype` (Egor's branch):** Contains the 6 Next.js Serverless API route handlers (`/api/auth/verify-ticket`, `/api/inventory`, `/api/orders`, `/api/orders/[id]/status`, `/api/payment/checkout`, `/api/stations/capacity`), high-resolution food & merch photography, the `/pass` digital pass page with dynamic SVG QR codes, 4-box numeric pickup fallback (`8 | 2 | 9 | X`), and the Figma design tokens.

This plan unifies these components into a single, cohesive, production-ready full-stack application deployed on your personal AWS account (`ap-southeast-2`), backed by persistent storage, real Ed25519 cryptographic pass signing, and an automated CI/CD pipeline.

---

## Part 1: Deep Codebase Audit & Baseline Diagnostics

### 1.1 Architecture & Stack Summary
* **Frontend Framework:** Next.js 14.2 (App Router), React 18, TypeScript 5.
* **Styling & Design System:** Tailwind CSS 3.4 with custom Grand Prix design tokens (Electric Yellow `#DFFF19`, Brand Red `#E10600`, Surface `#0B0B0F`, Background `#050505`).
* **Icons & Assets:** Dual dependency split (`@iconify/react` used in `develop`, `lucide-react` used in `UI_prototype`).
* **Geospatial & Mapping:** `react-map-gl` v8 with `mapbox-gl` v3 rendering Albert Park circuit coordinates and trackside pods (M1–M4).
* **Cryptographic Engine:** Ed25519 asymmetric pass generation and offline verification (`crypto-poc/ed25519_offline_verifier_demo.ts`).
* **Backend API:** 6 Next.js Serverless Route Handlers in `src/app/api/`.
* **Database & Persistence:** None currently wired; relies on in-memory React state and hardcoded static arrays in `*ConstantData.tsx` and `menu.ts`.
* **Infrastructure:** Historical `amplify.yml` referencing old team environment; no isolated Infrastructure-as-Code (IaC) or personal AWS configuration.

### 1.2 Working End-to-End
* **Standalone Ed25519 Crypto Benchmark:** `crypto-poc/ed25519_offline_verifier_demo.ts` executes cleanly under `tsx`, passing all 5 verification tests (0.045 ms average verification latency, tamper detection, and replay resistance).
* **UI Layouts & Components:** Navigation bar, bottom action drawers, category tabs, quantity steppers, voucher inputs, and dialogs render cleanly.

### 1.3 Mocked & Stubbed Flows
* **Order Placement (`CheckoutContent.tsx`):**
  * Line 104 has `if (!demoMode) return;` — if demo mode is off, clicking "Place Order" does nothing.
  * In-memory `placeOrder` only updates local React state (`activeOrder`), which is lost immediately on page reload. No HTTP `POST /api/orders` call occurs.
* **Order Lifecycle Progression (`DemoOrderLifecycle.tsx`):**
  * Status transitions (`RECEIVED` -> `PREPARING` -> `READY`) are simulated client-side via `setTimeout(..., DEMO_ORDER_STATUS_DELAY_MS)`.
  * No backend order status polling, SSE, or WebSocket connection exists.
* **Pass & Collection QR Codes (`CollectReadyState.tsx`):**
  * The `/collect` screen renders a hardcoded static PNG screenshot (`/images/qr_code_figma.png`) instead of dynamically rendering the pass payload.
* **API Route Handlers (`src/app/api/*`):**
  * All 6 endpoints in `UI_prototype` return hardcoded mock JSON objects without database reads or writes.
* **Ticket Verification (`/api/auth/verify-ticket`):**
  * Checks string prefix `GP-` and hardcodes fan profile `Egor Zvyagin`, Clark Grandstand, Row H, Seat 14.
* **Rewards & Loyalty Balance:**
  * Uses static constants (`MOCK_REWARDS_PROFILE`, 1000 points). No persistent user profile or transaction history.

### 1.4 Broken Features & Failing Checks
* **Root Codebase Disconnect:** The root branch `main` points to an empty starter app (`pit-stop-food-and-merch-drop/`), while all team and feature code exists in `frontend/` on other branches.
* **Mapbox GL SSR Crash:** In `origin/develop:frontend/src/components/home/HomeContent.tsx`, `PitStopMap` is imported statically (`import PitStopMap from "@/components/PitStopMap"`). Next.js SSR crashes during `npm run build` on headless environments with `ReferenceError: window is not defined` unless dynamically loaded with `{ ssr: false }`.
* **Environment Variable Mismatch:** `PitStopMap.tsx` expects `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, while `README.md` documents `NEXT_PUBLIC_MAPBOX_TOKEN`.
* **Missing Fallback for Mapbox:** If no token is provided in `.env`, Mapbox fails catastrophically instead of rendering an elegant offline/demo SVG fallback circuit diagram.

### 1.5 Unbuilt / Planned Features from Project Scope
* **Unified Database Layer:** DynamoDB persistence for Concessions, Orders, Stations, and Users.
* **End-to-End Cryptographic Pass Issuance:** Real signing of order passes via the Ed25519 engine during order creation, producing verifiable dynamic QR codes.
* **Concession Staff / Kiosk Scanner Portal (`/vendor`):** An express kiosk scan view allowing staff to scan customer QR passes, verify Ed25519 signatures offline, and dispense locker orders.
* **Dynamic EatClub Yield Engine:** Real-time discount calculation based on circuit status (Green Flag 15–20% off vs Safety Car / Peak Concession prices).

---

## Part 2: Standalone AWS Architecture & Decoupling Plan

### 2.1 Decoupling & Cloud State Isolation
* **Git Remote:** `origin` is locked to `https://github.com/egor-zvyagin/Pit-Stop-Food-And-Merch-Drop.git`. The `upstream` team remote has been permanently purged.
* **Team Resource Isolation:** References to the team Amplify domain (`d377mhe4uece5s.amplifyapp.com`) will be completely replaced with configurable environment variables.
* **New AWS Target:** Personal AWS account in Region `ap-southeast-2` (Sydney).

### 2.2 Cost-Optimized Cloud Design ($0.00 – $2.00/month)
To prevent unexpected cloud bills, the architecture strictly eliminates high-cost enterprise services and adopts 100% serverless scale-to-zero primitives:

| Component | Recommended Solution | High-Cost Anti-Pattern Avoided | Idle Monthly Cost |
|---|---|---|---|
| **Hosting & CDN** | AWS Amplify Hosting (Gen 2) OR CloudFront + S3 | Dedicated EC2 or ECS Fargate clusters | \$0.00 |
| **Compute / API** | Next.js Serverless SSR Lambda Functions | Idle Application Load Balancer (\$16.20/mo) | \$0.00 (within 1M free req/mo) |
| **Database** | Amazon DynamoDB (On-Demand / Pay-Per-Request) | RDS PostgreSQL / Aurora (\$15–\$45/mo) | \$0.00 |
| **VPC & Networking**| Direct AWS SDK via HTTPS (No VPC needed for Lambda) | NAT Gateways (\$32.85/mo per AZ) | \$0.00 |
| **Pass Security** | Local Ed25519 Keypair via Node.js `crypto` | Dedicated AWS CloudHSM (\$1,000+/mo) | \$0.00 |

### 2.3 DynamoDB Single-Table Schema (`pitstop_data`)
* **Primary Key:** `PK` (String), **Sort Key:** `SK` (String)
* **Global Secondary Index:** `GSI1PK` (String), `GSI1SK` (String)

```
Entity              PK                   SK                  Attributes
--------------------------------------------------------------------------------------------------------------
Concession Item     ITEM#<id>            METADATA            name, category, price, stock, prepTime, image, tag
Order               ORDER#<orderId>      METADATA            pinCode, status, items, subtotal, discount, total,
                                                             stationId, lockerNumber, qrPayload, signature, createdAt
                                                             [GSI1PK: TICKET#<ticketCode>, GSI1SK: ORDER#<orderId>]
Trackside Pod       STATION#<id>         METADATA            name, location, capacity, queueTimeMins, status
Ticket / Fan User   TICKET#<ticketCode>  PROFILE             holderName, grandstand, seat, points, tier, badges
Voucher Promo       VOUCHER#<code>       METADATA            discountType, value, minOrder, active
```

### 2.4 Configuration Matrix

#### A. Local Development Environment (`.env.local`)
```ini
# Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Geospatial
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoiZXhhbXBsZS...

# AWS Configuration (Optional locally - fallback to in-memory/mock when unset)
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
DYNAMODB_TABLE_NAME=pitstop_data
USE_MOCK_DB=true

# Cryptographic Keys (Ed25519 Pass Signing)
ED25519_PRIVATE_KEY_BASE64=
ED25519_PUBLIC_KEY_BASE64=
```

#### B. GitHub Actions Deployment Secrets
* `AWS_ACCESS_KEY_ID`: IAM user with least-privilege deployment rights.
* `AWS_SECRET_ACCESS_KEY`: IAM secret access key.
* `AWS_REGION`: `ap-southeast-2`.
* `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`: Mapbox public access token.

#### C. Minimum Privilege IAM Policy for App
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-southeast-2:*:table/pitstop_data",
        "arn:aws:dynamodb:ap-southeast-2:*:table/pitstop_data/index/*"
      ]
    }
  ]
}
```

---

## Part 3: Phased Execution Roadmap

```mermaid
flowchart TD
    subgraph Phase 1: Decoupling & Parity
        P1_1[Consolidate Workspace into frontend/] --> P1_2[Harmonize Design Tokens & Icons]
        P1_2 --> P1_3[Fix Mapbox GL SSR Dynamic Import]
        P1_3 --> P1_4[Build & Typecheck Baseline Pass]
    end

    subgraph Phase 2: Core Backend & Data Persistence
        P2_1[Implement DB Adapter DynamoDB + Local Fallback] --> P2_2[Connect Next.js API Routes to DB]
        P2_2 --> P2_3[Integrate Ed25519 Pass Signing Engine]
        P2_3 --> P2_4[Wire Checkout to Real POST /api/orders]
    end

    subgraph Phase 3: Feature Polish & Vendor Experience
        P3_1[Build Real Dynamic QR & 4-Box Numeric Fallback] --> P3_2[Build Concession Staff Scanner /vendor]
        P3_2 --> P3_3[Implement Real-time Order Polling / Status]
        P3_3 --> P3_4[Wire Rewards & EatClub Yield Engine]
    end

    subgraph Phase 4: Seeding, Verification & AWS Deployment
        P4_1[Create Rich Circuit Database Seed Script] --> P4_2[End-to-End Test Suite Execution]
        P4_2 --> P4_3[Deploy to Personal AWS ap-southeast-2]
        P4_3 --> P4_4[Live Production Smoke Test]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
```

---

### Phase 1 — Decoupling, Consolidation & Local Dev Parity

#### Task 1.1: Clean Directory Restructuring & Branch Convergence
* **Goal:** Merge the rich 5-page frontend from `origin/develop`, the serverless APIs & photography from `origin/feature/UI_prototype`, and the `crypto-poc` from `main` into a clean, canonical structure at `frontend/`.
* **Files to Modify/Create:**
  * `frontend/` (ensure all pages `/`, `/order`, `/checkout`, `/collect`, `/rewards`, `/pass` are present).
  * `frontend/public/images/` (include all high-res photography: `burger.jpg`, `beer.jpg`, `pizza.jpg`, etc.).
  * `frontend/package.json` (unify dependencies: `@iconify/react`, `lucide-react`, `qrcode.react`, `mapbox-gl`, `react-map-gl`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`).
  * Remove redundant `pit-stop-food-and-merch-drop/` placeholder folder.
* **Verification:**
  ```bash
  cd frontend && npm install && npm ls
  ```

#### Task 1.2: Fix Mapbox GL SSR Crash & Graceful Fallback
* **Goal:** Wrap `PitStopMap` in `next/dynamic` with `ssr: false` in `HomeContent.tsx` to eliminate build crashes; add an offline SVG circuit fallback if `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is unset.
* **Files to Modify/Create:**
  * `frontend/src/components/home/HomeContent.tsx`
  * `frontend/src/components/PitStopMap.tsx`
  * `frontend/src/components/map/OfflineCircuitMapFallback.tsx`
* **Verification:**
  ```bash
  cd frontend && NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="" npm run build
  ```

#### Task 1.3: Environment Configuration & Decoupling
* **Goal:** Create `.env.example` and `.env.local` stripping all references to `d377mhe4uece5s.amplifyapp.com`. Update `README.md` to document the unified stack and local development setup.
* **Files to Modify/Create:**
  * `frontend/.env.example`
  * `frontend/.env.local`
  * `README.md`
* **Verification:**
  ```bash
  grep -rn "d377mhe4uece5s" . || echo "Clean: Zero team references found"
  ```

---

### Phase 2 — Core Backend, Database Persistence & Cryptographic Pass Signing

#### Task 2.1: Storage Abstraction Layer (DynamoDB + In-Memory/Local Fallback)
* **Goal:** Implement a unified database client that connects to AWS DynamoDB when AWS credentials exist, and seamlessly falls back to a zero-config JSON/In-Memory store during local development or offline grading.
* **Files to Create:**
  * `frontend/src/lib/db/client.ts`
  * `frontend/src/lib/db/concessions.ts`
  * `frontend/src/lib/db/orders.ts`
  * `frontend/src/lib/db/stations.ts`
  * `frontend/src/lib/db/tickets.ts`
* **Verification:**
  ```bash
  npx tsx frontend/src/lib/db/__tests__/test_db_adapter.ts
  ```

#### Task 2.2: Cryptographic Pass Generation Integration
* **Goal:** Port the Ed25519 signing engine from `crypto-poc` into Next.js server utilities. Upon order creation, sign a canonical payload with the server key and generate a cryptographically tamper-proof pass token.
* **Files to Create:**
  * `frontend/src/lib/crypto/passEngine.ts`
  * `frontend/src/lib/crypto/keys.ts`
* **Verification:**
  ```bash
  npx tsx frontend/src/lib/crypto/__tests__/test_pass_engine.ts
  ```

#### Task 2.3: Connect API Routes to Real Persistence
* **Goal:** Upgrade all 6 route handlers from static mock returns to real CRUD operations using the storage layer and crypto engine.
* **Files to Modify/Create:**
  * `frontend/src/app/api/orders/route.ts` (POST: validates cart, computes discount, creates order, signs pass, saves to DB. GET: queries active orders).
  * `frontend/src/app/api/orders/[id]/status/route.ts` (GET: returns live order state; PATCH: updates status).
  * `frontend/src/app/api/inventory/route.ts` (GET: live concession menu and stock).
  * `frontend/src/app/api/stations/capacity/route.ts` (GET: live queue times and pod loads).
  * `frontend/src/app/api/auth/verify-ticket/route.ts` (POST: validates Grand Prix ticket against DB).
  * `frontend/src/app/api/payment/checkout/route.ts` (POST: simulated payment gateway with idempotency).
* **Verification:**
  ```bash
  curl -s -X POST http://localhost:3000/api/auth/verify-ticket -H "Content-Type: application/json" -d '{"ticketCode":"GP-3820-X"}' | jq .
  curl -s http://localhost:3000/api/inventory | jq .
  ```

#### Task 2.4: Wire Frontend Checkout to Real Order API
* **Goal:** Remove `if (!demoMode) return;` from `CheckoutContent.tsx`. When the user clicks "Place Order", send a real HTTP `POST /api/orders`, persist the order, and redirect to the live order pass screen.
* **Files to Modify:**
  * `frontend/src/components/checkout/CheckoutContent.tsx`
  * `frontend/src/components/order/OrderProvider.tsx`
* **Verification:**
  * Complete an order in the browser; verify via `curl http://localhost:3000/api/orders/<orderId>` that the order is retrieved from the database.

---

### Phase 3 — Feature Polish, Concession Staff Scanner & Real-Time Flow

#### Task 3.1: Dynamic Digital Pass & 4-Box Numeric Fallback
* **Goal:** Unify the `/collect` and `/pass` views. Render real SVG QR codes generated with `qrcode.react` encoding the Ed25519 digital pass. Render the 4-digit numeric fallback code and locker countdown.
* **Files to Modify/Create:**
  * `frontend/src/components/collect/CollectReadyState.tsx`
  * `frontend/src/app/pass/page.tsx`
* **Verification:**
  * Inspect generated QR code in browser; scan with standard camera to verify canonical payload string.

#### Task 3.2: Concession Staff / Kiosk Scanner Portal (`/vendor`)
* **Goal:** Create a trackside staff portal where concession operators can either scan customer QR passes using their device camera or manually input the 4-digit PIN to verify the Ed25519 signature offline, dispense the order, and mark it as `COMPLETED`.
* **Files to Create:**
  * `frontend/src/app/vendor/page.tsx`
  * `frontend/src/components/vendor/ScannerTerminal.tsx`
  * `frontend/src/components/vendor/ManualPinEntry.tsx`
* **Verification:**
  * Open `/vendor` in browser; submit 4-digit PIN for an active order; verify signature check succeeds and status transitions to `COMPLETED`.

#### Task 3.3: Real-Time Order Lifecycle Polling
* **Goal:** Replace `setTimeout` in `DemoOrderLifecycle.tsx` with periodic polling or Server-Sent Events (SSE) checking `/api/orders/[id]/status` so the customer's phone updates as staff prepare and fulfill orders.
* **Files to Modify:**
  * `frontend/src/components/demo/DemoOrderLifecycle.tsx`
  * `frontend/src/components/order/OrderProvider.tsx`
* **Verification:**
  * Update order status via `/vendor` or `curl -X PATCH`; observe the customer's `/collect` screen update in real time.

#### Task 3.4: Dynamic Yield Discount Engine (`PITSTOP15`) & Rewards
* **Goal:** Enable the dynamic discount engine to apply the 15% `PITSTOP15` discount based on real circuit conditions (e.g., Green Flag off-peak session). Wire loyalty points accumulation directly to completed orders.
* **Files to Modify:**
  * `frontend/src/components/RaceAlertBanner.tsx`
  * `frontend/src/components/checkout/CheckoutVoucher.tsx`
  * `frontend/src/components/reward/RewardsProvider.tsx`
* **Verification:**
  * Apply `PITSTOP15` voucher during a Green Flag state; confirm 15% discount reflects in order total and rewarded loyalty points.

---

### Phase 4 — Seed Data, Automated Testing & Personal AWS Deployment

#### Task 4.1: Comprehensive Albert Park Seed Script
* **Goal:** Create a comprehensive seed script that populates DynamoDB (and local mock storage) with rich, realistic Grand Prix data:
  * 4 Trackside Pods: M1 (Main Straight), M2 (Turn 9 East), M3 (Clark Chicane), M4 (Albert Park Green).
  * Concession Menu: Food, chilled beverages, and limited-drop merchandise with real photographic assets.
  * Demo Ticket Holders: Grandstand ticket passes, active vouchers, and tier points for demonstration.
* **Files to Create:**
  * `frontend/src/scripts/seed.ts`
* **Verification:**
  ```bash
  cd frontend && npx tsx src/scripts/seed.ts
  ```

#### Task 4.2: Automated Integration & Unit Test Suite
* **Goal:** Add comprehensive tests covering Ed25519 pass verification, ticket verification, order calculations, and API contracts.
* **Files to Create:**
  * `frontend/src/__tests__/crypto.test.ts`
  * `frontend/src/__tests__/orderCalculation.test.ts`
  * `frontend/src/__tests__/apiRoutes.test.ts`
* **Verification:**
  ```bash
  cd frontend && npm test
  ```

#### Task 4.3: Infrastructure-as-Code & AWS Deployment (`ap-southeast-2`)
* **Goal:** Provision the fresh, isolated AWS infrastructure on your personal AWS account using AWS Amplify Gen 2 or Terraform:
  * Create `amplify.yml` configured for your personal fork.
  * Provision DynamoDB table `pitstop_data` in `ap-southeast-2` with Pay-Per-Request billing mode.
  * Connect repository to your personal AWS account.
* **Files to Create/Modify:**
  * `amplify.yml`
  * `infra/terraform/main.tf` (standalone IaC option)
  * `infra/terraform/dynamodb.tf`
  * `.github/workflows/deploy.yml` (automated CI/CD on push to `main`)
* **Verification:**
  ```bash
  aws dynamodb describe-table --table-name pitstop_data --region ap-southeast-2
  ```

#### Task 4.4: Live Production Smoke Test
* **Goal:** Perform full end-to-end smoke test on the live production URL: verify Mapbox rendering, browse catalog, add items, place order, verify signed Ed25519 QR pass, and scan/fulfill via `/vendor`.
* **Verification:**
  * Confirm 0 console errors, 100% successful API calls, sub-10ms offline QR verification, and \$0 idle cost.

---

## Decisions Requiring Your Input Before Starting Phase 1

1. **AWS Deployment Method Preference:**
   * **Option A (AWS Amplify Gen 2 — Recommended):** Easiest to maintain, automated branch previews, zero infrastructure maintenance, natively supports Next.js 14 App Router SSR, $0.00 idle cost.
   * **Option B (Terraform + CloudFront + S3 + Lambda Web Adapter):** Maximum infrastructure control, 100% open-source IaC, completely independent of Amplify, $0.00 idle cost.
2. **Icons Library Strategy:**
   * Shall we standardize on **`lucide-react`** (modern, tree-shakeable, bundled locally) or retain **`@iconify/react`**? (Recommendation: Standardize on `lucide-react` with custom SVG fallbacks for faster bundle loading and zero external icon API calls).
3. **Primary Navigation Architecture:**
   * Shall we preserve the 5-page bottom navigation (`Home`, `Order`, `Checkout`, `Collect`, `Rewards`) from `develop` and embed the high-res photography and express `/pass` and `/vendor` screens into this structure? (Recommendation: Yes, this gives the complete, immersive Grand Prix fan journey).

---
*Ready to begin upon your approval of this plan.*
