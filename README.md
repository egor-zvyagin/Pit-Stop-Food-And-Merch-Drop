# Pit Stop: Food & Merch Drop Ecosystem

**Order ahead. Pick up fast. Get back to the on-track action.**  
*Commissioned for the Australian Grand Prix Corporation (AGPC) Fan Experience Innovation Project.*

[![Live Staging](https://img.shields.io/badge/AWS_Amplify-Live_Staging-FF9900?style=for-the-badge&logo=amazon-aws)](https://develop.d377mhe4uece5s.amplifyapp.com/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.x-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Mapbox GL](https://img.shields.io/badge/Mapbox_GL-Interactive_Maps-000000?style=for-the-badge&logo=mapbox)](https://www.mapbox.com/)

---

## Live Deployment & Links
* **Live AWS Amplify Staging Environment:** [https://develop.d377mhe4uece5s.amplifyapp.com/](https://develop.d377mhe4uece5s.amplifyapp.com/)
* **Project Type:** Next.js Full-Stack Web Application & Serverless Cloud Architecture
* **Target Event:** Formula 1® Australian Grand Prix (Albert Park Circuit, Melbourne)

---

## Executive & Technical Overview

**Pit Stop: Food & Merch Drop** is an enterprise fan-engagement and race-day logistics platform architected for high-density public events. During peak Formula 1 race sessions at Albert Park, over 100,000 attendees place extreme stress on local cellular towers and retail outlets, causing severe network latency and 45+ minute concession queues.

Pit Stop solves these challenges by combining:
1. **Intelligent In-App Ordering & Pre-Orders:** Fans can order food, beverages, and team merchandise in advance, selecting scheduled pickup intervals aligned with race sessions.
2. **Dynamic Geospatial Routing:** Powered by **Mapbox GL**, fans receive turn-by-turn guidance to the nearest un-congested "Pit Stop Drop Point" relative to their circuit grandstand or general admission zone.
3. **Sub-10ms Offline Ed25519 Verification:** When 4G/5G cellular connectivity collapses under network congestion, customer order passes are cryptographically signed using Ed25519 digital signatures. Concession staff scan barcodes using vendor devices that verify order authenticity locally in under 10ms with zero cellular round-trips.
4. **ACID Transactional State Machine:** Backend order flows transition across deterministic states (`SUBMITTED` -> `PREPARING` -> `READY_FOR_PICKUP` -> `COLLECTED`), preventing double-redemption through idempotent conditional writes.

---

## Tech Stack & Architecture

| Layer | Technologies & Frameworks |
|---|---|
| **Frontend Framework** | **Next.js 14** (App Router), **React 18**, **TypeScript 5** |
| **Styling & UI Components** | **Tailwind CSS**, Lucide Icons, Headless UI |
| **Geospatial & Mapping** | **Mapbox GL JS** with customized circuit geo-boundaries and zone markers |
| **Hosting & CI/CD** | **AWS Amplify (Gen 2)** with automated branch previews and continuous deployment |
| **Cloud Services** | AWS Lambda, Amazon DynamoDB, AWS IAM, Amazon API Gateway |
| **Cryptography & Security** | Ed25519 asymmetric signature generation & offline barcode verification |

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
Create a `.env.local` file inside the `pit-stop-food-and-merch-drop` directory:
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
NEXT_PUBLIC_API_BASE_URL=https://develop.d377mhe4uece5s.amplifyapp.com/api
```

### 5. Launch Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to inspect the application.

### 6. Production Build & Linting
```bash
# Run ESLint validation
npm run lint

# Compile production Next.js build
npm run build
```

---

## Key Architectural Decisions

1. **Next.js 14 App Router for Server-Side Rendering (SSR):**  
   Initial page bundles and menu catalogs are statically pre-rendered at the edge, reducing mobile data consumption and rendering menus instantly on mobile browsers even in poor signal conditions.
2. **Mapbox GL Integration with Vector Tiles:**  
   Circuit maps and vendor waypoints render natively via WebGL canvas, providing silky-smooth 60fps zooming and panning without high memory footprints.
3. **AWS Amplify CI/CD Automation:**  
   Code commits merged into the `develop` branch trigger automated multi-stage build, lint, and test pipelines, deploying directly to global AWS Edge CloudFront distributions.

---

## Project Team & Governance

| Name | Role & Specialisation | GitHub Profile |
|---|---|---|
| **Egor Zvyagin** | Product Owner / Full-Stack & Cloud Engineer | [@egor-zvyagin](https://github.com/egor-zvyagin) |
| **Hui Wen Chew** | UX / UI Design Lead | [@huiwenchew](https://github.com/huiwenchew) |
| **Sahibjeet Singh** | Developer & Quality Assurance Engineer | [@Sahib-11](https://github.com/Sahib-11) |
| **Muhammad Rayyan Sohail** | Business Analyst & Requirements Engineer | [@S4073657](https://github.com/S4073657) |

---

## Acknowledgements & Presentation
Delivered as part of the Australian Grand Prix Corporation (AGPC) Industry Engagement Initiative and presented live to AGPC Executive Stakeholders at AGPC Corporate Headquarters (Melbourne).
