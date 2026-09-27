# Smart E-Mobility Hub

**Electric Mobility Coordination System for the VNU-HCM Urban Area**

Course project — Software Engineering (HK261), Ho Chi Minh City University of Technology (HCMUT)

## Project Overview

The VNU-HCM Urban Area connects multiple universities, dormitories, libraries, service facilities, and public transport (Metro Line 1). Students travel between campuses and functional areas using shared electric bicycles, motorcycles, and other e-mobility options. This creates a distributed software problem: not just vehicle management, but coordinating parking capacity, charging resources, and mobility demand across multiple locations in near real time.

**Smart E-Mobility Hub** is a system for managing and coordinating a network of electric mobility resources (Mobility Hubs) across the VNU-HCM Urban Area — each Hub containing parking spaces, charging points, and electric vehicles, with state updated via real or simulated IoT-style data.

## Core Software Engineering Challenges

This project focuses on state management, resource allocation, reservation handling, charging scheduling, vehicle dispatching, event handling, and what-if simulation — **not** hardware development or 3D map interfaces.

## Main Features

**Student-facing:**
- View Mobility Hubs and current resource status
- Find suitable rental vehicles; view availability and battery level
- Reserve rental vehicles and parking spaces
- Pick up / return rental vehicles
- Request or schedule charging services
- Private EV owners: reserve parking and charging resources in advance

**Operator-facing:**
- Monitor vehicles, parking capacity, charging points, and Hub utilization
- Handle operational incidents (unavailable vehicles, failed charging points)
- Coordinate/redistribute rental vehicles among Hubs
- Coordinate charging priorities and smart charging scheduling
- Run **What-if Simulation** scenarios and receive coordination recommendations (e.g. sudden demand surge at Metro station, a Hub reaching capacity, charging-point failures, uneven vehicle distribution)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Node.js |
| Database | MongoDB |

*(Confirmed by the team on 25/09 — see `project-management/` for the decision log.)*

## Architecture Overview

The system is organized around independent functional modules that communicate through a shared backend, each owning a distinct part of the domain (reservation, charging, dispatching, simulation). See `docs/03-architecture/` for the full architecture diagram, component responsibilities, and justification.

## Project Structure

```
.
├── docs/
│   ├── 01-requirements/       # Stakeholders, functional/non-functional requirements, use cases
│   ├── 02-analysis-design/    # Class diagram, ERD, activity/sequence/state diagrams, UI design
│   ├── 03-architecture/       # Architecture diagram, component responsibilities, trade-offs
│   ├── 04-api/                # API design/documentation
│   └── 05-testing/            # Test plan, test design, test cases, execution results
├── backend/                   # Node.js API and business logic
├── frontend/                  # React application
├── database/                  # Schema, seed/migration scripts
├── simulation/                # What-if simulation engine and scenario definitions
├── tests/                     # Automated test suites
├── project-management/        # Task tracking, meeting notes, role assignments
└── README.md
```

## Module Breakdown & Timeline

| Module | Scope | Timeline |
|---|---|---|
| Module 1 | [fill in based on team split] | 28/09 – 07/10 |
| Module 2 | [fill in based on team split] | 07/10 – 21/10 |
| Module 3 | [fill in based on team split] | [dates] |
| Module 4 | [fill in based on team split] | [dates] |
| Module 5 | [fill in based on team split] | [dates] |

**Phase 1 deadline (SRS + diagrams):** target before 30/11
**Overall timeline:** 19/09 – 07/12

*(See `project-management/tasks` for the detailed, up-to-date task board and individual assignments.)*

## Team Members & Roles

| Name | Role | Module(s) owned |
|---|---|---|
| [Name] | [Role] | [Module] |
| [Name] | [Role] | [Module] |
| [Name] | [Role] | [Module] |
| [Name] | [Role] | [Module] |
| [Name] | [Role] | [Module] |
| [Name] | [Role] | [Module] |

*Each member selected one primary role in the team meeting; shared deliverables (SRS, overall use-case model, architecture, integration, testing, demo) are reviewed by the whole team.*

## Setup & Run

```bash
# Clone the repository
git clone <repo-url>
cd smart-e-mobility-hub

# Backend
cd backend
npm install
npm run dev

# Frontend (in a separate terminal)
cd frontend
npm install
npm start

# Database
# MongoDB connection string configured via .env — see database/README.md
```

*(To be completed with exact ports/env variables once the MVP is running — required for report Task 4.1/Implementation Structure.)*

## Testing

Test plan, test design techniques (equivalence partitioning, boundary-value analysis, state-transition testing, etc.), and test cases live in `docs/05-testing/`. Automated tests live in `tests/`.

## Generative AI Usage Declaration

*(Mandatory per course policy — Section 6.1 of the report guideline)*

This project used AI assistance for: [e.g. brainstorming use-case scenarios, reviewing architecture options, debugging code, drafting documentation]. All AI-assisted content was reviewed, understood, and refined by the team; no content was submitted without the team being able to explain and defend it.

## Report & Documentation

The full project report (requirements analysis, system design, implementation, testing, evaluation) follows the structure defined in the course's *Report Guideline and Assessment Rubric*. See `docs/` for all supporting artifacts referenced in the report.

## License

Educational project for Software Engineering (HK261), HCMUT. Not for commercial use.