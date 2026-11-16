# Pit Stop: Food & Merch Drop Ecosystem

**Order ahead. Pick up fast. Get back to the on-track action.**  
*Commissioned for the Australian Grand Prix Corporation (AGPC) Fan Experience Innovation Project.*

[![Live Staging](https://img.shields.io/badge/AWS_Amplify-Live_Staging-FF9900?style=for-the-badge&logo=amazon-aws)](https://develop.d377mhe4uece5s.amplifyapp.com/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.x-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Mapbox GL](https://img.shields.io/badge/Mapbox_GL-Interactive_Maps-000000?style=for-the-badge&logo=mapbox)](https://www.mapbox.com/)
[![Ed25519 Cryptography](https://img.shields.io/badge/Ed25519-Offline_Verify-green?style=for-the-badge&logo=gnupg)](./crypto-poc)

---

## Live Deployment & Links
* **Live AWS Amplify Staging Environment:** [https://develop.d377mhe4uece5s.amplifyapp.com/](https://develop.d377mhe4uece5s.amplifyapp.com/)
* **Project Type:** Next.js Full-Stack Web Application & Serverless Cloud Architecture
* **Target Event:** Formula 1® Australian Grand Prix (Albert Park Circuit, Melbourne)
* **Standalone Crypto Benchmark:** [`/crypto-poc/ed25519_offline_verifier_demo.ts`](./crypto-poc/ed25519_offline_verifier_demo.ts)

---

## Executive & Technical Overview

**Pit Stop: Food & Merch Drop** is an enterprise fan-engagement and race-day logistics platform architected for high-density public events. During peak Formula 1 race sessions at Albert Park, over 100,000 concurrent spectators place extreme stress on local cellular towers and retail outlets, causing severe network latency and 45+ minute concession queues.

Pit Stop solves these operational challenges through four core capabilities:

1. **Intelligent In-App Ordering & Pre-Orders:** Fans place orders in advance, selecting scheduled pickup intervals aligned with race sessions and support races to eliminate lines.
2. **Dynamic Geospatial Routing Across 4 Trackside Pods (M1–M4):** Powered by **Mapbox GL**, fans receive real-time routing to their assigned pickup pod relative to grandstands and General Admission zones:
   * **Pod M1 (Main Straight / Pit Exit):** Serves Fangio, Senna, and Prost Grandstands.
   * **Pod M2 (Turn 4 / Lakeside Drive):** Serves Brabham and Jones Grandstands.
   * **Pod M3 (Turn 9 / Clarke Chicane):** Serves Waite and Clark Grandstands.
   * **Pod M4 (Turn 14 / Albert Park Green):** Serves General Admission and Village Precinct.
3. **15% `PITSTOP15` Off-Peak Green-Flag Discount Engine:** Modeled after EatClub's dynamic yield management, the platform dynamically triggers automated 15% promotional discounts (`PITSTOP15`) during low-queue green-flag sessions to balance spectator flow away from peak lunch/race finishes.
4. **Sub-10ms Offline Ed25519 Cryptographic Verification (`/crypto-poc`):** When 4G/5G mobile towers collapse under trackside density, customer order passes are validated offline via asymmetric Ed25519 digital signatures. Concession staff scan barcodes using vendor devices that execute cryptographic signature verification locally in under **10 ms** with zero network round-trips.

---

## Standalone Cryptographic Module (`/crypto-poc`)

The repository includes a standalone production-grade verification engine in [`/crypto-poc/ed25519_offline_verifier_demo.ts`](./crypto-poc/ed25519_offline_verifier_demo.ts) implemented with native Node.js `crypto`:
* **Zero External Dependencies:** Uses native Node.js `crypto.sign()` and `crypto.verify()` using raw 32-byte Ed25519 keys.
* **Compact Base64URL Payloads:** Packs order ID, user ID, pod assignment, and item manifests into compact strings (< 128 bytes) suitable for high-density QR encoding.
* **Benchmarked Verification Performance:** Averages **0.3 ms to 1.2 ms** per pass validation on standard x86 and ARM hardware, withstanding tamper attacks and replay attempts even in complete Airplane Mode.

Run the benchmark locally:
```bash
npx ts-node crypto-poc/ed25519_offline_verifier_demo.ts
```

---

## Tech Stack & Architecture

| Layer | Technologies & Frameworks |
|---|---|
| **Frontend Framework** | **Next.js 14** (App Router), **React 18**, **TypeScript 5** |
| **Styling & UI Components** | **Tailwind CSS**, Lucide Icons, Headless UI |
| **Geospatial & Mapping** | **Mapbox GL JS** (`react-map-gl`) with custom circuit boundaries & pod markers |
| **Hosting & CI/CD** | **AWS Amplify (Gen 2)** (`amplify.yml`) with automated branch deployments |
| **Cloud Services** | AWS Lambda, Amazon DynamoDB, AWS IAM, Amazon API Gateway |
| **Offline Security** | Ed25519 asymmetric signature generation & barcode validation (`crypto-poc/`) |

---

## Key Architectural Decisions & Engineering Solutions

1. **Mapbox GL SSR Crash Resolution via `next/dynamic` (`ssr: false`):**  
   Mapbox GL relies directly on browser-only primitives (`window`, `document`, and WebGL contexts). During server-side compilation on AWS Amplify, standard imports triggered fatal `ReferenceError: window is not defined` build exceptions. This was engineered by wrapping map components in dynamic imports:
   ```typescript
   import dynamic from 'next/dynamic';

   export const CircuitMap = dynamic(
     () => import('@/components/map/CircuitMap'),
     { ssr: false, loading: () => <MapLoadingSkeleton /> }
   );
   ```
2. **Next.js 14 App Router for Edge-Cached Catalogs:**  
   Static menu items and concession metadata are pre-rendered at the edge, allowing mobile browsers to render catalogs instantly even on congested 3G connections.
3. **AWS Amplify CI/CD Integration:**  
   Every pull request generates isolated cloud staging previews, while merges to `main` and `develop` automatically run linting, TypeScript compilation, and global CloudFront distribution deployment.

---

## Frontend Setup & Local Development

### 1. Prerequisites
- **Node.js:** `>= 18.17.0` (v20.x LTS recommended)
- **Package Manager:** `npm` (v9+) or `pnpm`

### 2. Clone Repository
```bash
git clone https://github.com/egor-zvyagin/Pit-Stop-Food-And-Merch-Drop.git
cd Pit-Stop-Food-And-Merch-Drop/pit-stop-food-and-merch-drop
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env.local` file inside `pit-stop-food-and-merch-drop`:
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
NEXT_PUBLIC_API_BASE_URL=https://develop.d377mhe4uece5s.amplifyapp.com/api
```

### 5. Launch Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### 6. Production Build & Linting
```bash
# Run ESLint validation
npm run lint

# Compile production Next.js build
npm run build
```

---

## Project Team & Governance

| Name | Role & Specialisation | GitHub Profile |
|---|---|---|
| **Egor Zvyagin** | Product Owner / Full-Stack & Cloud Engineer | [@egor-zvyagin](https://github.com/egor-zvyagin) |
| **Hui Wen Chew** | UX / UI Design Lead | [@huiwenchew](https://github.com/huiwenchew) |
| **Sahibjeet Singh** | Developer & Quality Assurance Engineer | [@Sahib-11](https://github.com/Sahib-11) |
| **Muhammad Rayyan Sohail** | Business Analyst & Requirements Engineer | [@S4073657](https://github.com/S4073657) |

---

## Acknowledgements & Industry Presentation
Delivered as part of the Australian Grand Prix Corporation (AGPC) Industry Engagement Initiative. Exclusively invited to present live technical demonstrations to AGPC Executive Stakeholders at AGPC Corporate Headquarters (St Kilda Road, Melbourne), and selected for the **RMIT UNAUTOMATED Showcase**.
