# Smart E-Mobility Hub

**Electric Mobility Coordination System for the VNU-HCM Urban Area**

Course project — Software Engineering (HK261), Ho Chi Minh City University of Technology (HCMUT)

## Project Overview

The VNU-HCM Urban Area connects multiple universities, dormitories, libraries, service facilities, and public transport (Metro Line 1). Students travel between campuses and functional areas using shared electric bicycles, motorcycles, and other e-mobility options. This creates a distributed software problem: not just vehicle management, but coordinating parking capacity, charging resources, and mobility demand across multiple locations in near real time.

**Smart E-Mobility Hub** is a system for managing and coordinating a network of electric mobility resources (Mobility Hubs) across the VNU-HCM Urban Area — each Hub containing parking spaces, charging points, and electric vehicles, with state updated via real or simulated IoT-style data.

## Core Software Engineering Challenges

This project focuses on state management, resource allocation, reservation handling, charging scheduling, vehicle dispatching, event handling, and what-if simulation — **not** hardware development or 3D map interfaces.

## Main Features

**Student / EV User-facing (`USER` role):**
- View Mobility Hubs and current resource status (`UC01`)
- Find suitable rental vehicles; view availability and battery level (`UC02`, `UC04a`)
- View parking slots and charging point status (`UC03`)
- Reserve and cancel rental vehicles (`UC04`, `UC05`)
- Pick up and return rental vehicles (`UC06`, `UC07`)
- Private EV owners & renters: reserve parking spaces and schedule charging services (`UC08`, `UC09`)

**Operator-facing (`OPERATOR` role):**
- Monitor Hub network utilization, vehicles, parking capacity, and near-full alerts (`UC10`)
- Record operational incidents and close incidents after repair (`UC11`, `UC12`)
- Redistribute rental vehicles among Hubs with free-parking validation (`UC13`, `UC07a`)
- Set charging priorities and coordinate smart charging queues (`UC15`, `UC09a`)
- Run **What-if Simulation** scenarios on isolated state snapshots and apply coordination recommendations (`UC16`, `UC17`, `UC18`)

**IoT / Simulated Telemetry (`A3`):**
- Periodic telemetry ingestion for vehicle battery, parking occupancy, and charger status (`UC14`)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite, React Router v6) |
| Backend | Node.js (Express.js, REST API, JWT + Google OAuth2) |
| Database | MySQL 8.0 (`mysql2/promise` connection pool) |

## Architecture Overview

The system uses a **Layered Modular Monolith** architecture:
- **Frontend (`frontend/`)**: React SPA with role-based routing (`USER` vs `OPERATOR`) and a dual-mode API layer (`VITE_USE_MOCK_API=true|false`) backed by the OpenAPI contract (`docs/04-api/openapi.yaml`) so UI development runs in parallel with backend development.
- **Backend (`backend/`)**: Express.js modules organized by domain (`auth`, `hubs`, `vehicles`, `reservations`, `charging`, `operator`, `simulation`, `telemetry`).
- **Database (`database/`)**: Relational MySQL schema enforcing entity integrity and explicit resource state transitions (`AVAILABLE -> RESERVED -> IN_USE -> CHARGING -> OUT_OF_SERVICE`).
- **Simulation Engine (`backend/src/modules/simulation/` & `simulation/`)**: Executes scenarios (`DEMAND_SURGE`, `HUB_FULL`, `CHARGER_FAILURE`, `VEHICLE_IMBALANCE`) on an **in-memory cloned snapshot** so live MySQL operational data is never corrupted unless the Operator explicitly applies a recommendation.

## Project Structure

```text
.
├── docs/
│   ├── 01-requirements/       # Stakeholders, FR/NFR, business rules, use cases
│   ├── 02-analysis-design/    # Class diagram, ERD, activity/sequence/state diagrams, wireframes
│   ├── 03-architecture/       # Architecture diagram, component/deployment diagrams, ADR
│   ├── 04-api/                # OpenAPI 3.0 specification (openapi.yaml)
│   ├── 05-testing/            # Test plan, test cases, execution results
│   └── project-management/    # Task tracking, sprint board, meeting notes
├── backend/                   # Node.js + Express REST API & business logic
├── frontend/                  # React (Vite) frontend application + Mock API client
├── database/                  # MySQL DDL schema.sql & seed.sql scripts
├── simulation/                # Standalone simulation scenario specs & scripts
├── tests/                     # Automated integration & unit test suites
└── README.md
```

## Implementation Roadmap

| Phase / Sprint | Scope | Timeline |
|---|---|---|
| Phase 1: Requirements | Problem statement, stakeholders, FR/NFR, business rules, use cases | 28/09 – 05/10 |
| Phase 2A & 2B: Design & Architecture | Wireframes, Activity/Sequence/State diagrams, MySQL ERD, OpenAPI spec | 06/10 – 19/10 |
| Phase 3: Implementation Sprint 1 | FE Foundation (3.0), Core MySQL & A3 Simulator (3.1), Google Auth (3.1c), Student UI/API (3.2), Operator Monitoring & Incidents (3.3) | 20/10 – 08/11 |
| Phase 4: Implementation Sprint 2 | Charging Queue & Dispatch (4.1), What-if Simulation Engine & UI (4.2), System Testing | 03/11 – 16/11 |

## Setup & Run

### 1. Database (MySQL 8.0+)

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p smart_emobility_hub < database/seed.sql
```

### 2. Backend (`http://localhost:4000`)

```bash
cd backend
cp .env.example .env
# Edit .env with your local MySQL credentials and Google Client ID
npm install
npm run dev
```

### 3. Frontend (`http://localhost:5173`)

```bash
cd frontend
cp .env.example .env
# Default VITE_USE_MOCK_API=true lets you run the full UI without backend/DB!
# Set VITE_USE_MOCK_API=false once the backend & MySQL are running.
npm install
npm run dev
```

## Generative AI Usage Declaration

*(Mandatory per course policy — Section 6.1 of the report guideline)*

This project used AI assistance for scaffolding project boilerplate, reviewing API contracts, and drafting documentation templates. All AI-assisted content was reviewed, understood, and refined by the team; no content was submitted without the team being able to explain and defend it.

## License

Educational project for Software Engineering (HK261), HCMUT. Not for commercial use.
