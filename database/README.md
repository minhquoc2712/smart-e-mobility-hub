# Database Layer (MySQL 8.0)

This folder stores the relational database schema and seed data for **Smart E-Mobility Hub** (Tasks `2B.1`, `3.1`, `3.1b`).

## Quick Start

1. Make sure MySQL 8.0+ is running locally (`localhost:3306`).
2. Create the database and tables:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
3. Load initial VNU-HCM Hubs, vehicles, parking slots, charging points, sample users, and What-if scenarios:
   ```bash
   mysql -u root -p smart_emobility_hub < database/seed.sql
   ```
4. Configure `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=smart_emobility_hub`).
