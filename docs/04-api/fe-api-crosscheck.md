# Frontend ↔ OpenAPI cross-check

Purpose: list every API call the frontend screens make, compare it with `docs/04-api/openapi.yaml`
and the backend routes, and record what the FE and BE owners agree to change.

- Compared against: `main` @ `000ca35`, `openapi.yaml`, `backend/src/modules/**/*.routes.js`, `frontend/src/api/index.js`.
- Base URL: `http://localhost:4000/api/v1`. All paths below are relative to it.
- **Status** column: fill in during the FE/BE meeting — `OK`, `Fix FE`, `Fix BE`, `Update spec`, `Drop`.

Legend: ✅ matches · ⚠️ works but differs · ❌ missing

---

## 1. Screens and the endpoints they call

| Screen | Method & path | In OpenAPI | In BE | Notes | Status |
|---|---|---|---|---|---|
| Login (`AuthContext`) | `POST /auth/google` | ✅ | ✅ | Spec lists 200/401 only; BE also returns 400 (missing credential) and 403 `ACCOUNT_MISMATCH`. The 200 body now also has `isNewUser` (true when this sign-in created the account) — add it to the spec. | |
| Login – Sign up | `POST /auth/register` | ✅ | ✅ | New: email + password sign up, always creates a USER account (no email verification). | |
| Login – Log in | `POST /auth/login` | ✅ | ✅ | New: email + password log in. Google-only accounts have no password → 401. | |
| Login (`AuthContext`) | `POST /auth/dev-login` | ✅ | ✅ | BE returns 404 unless `NODE_ENV=development`; spec says nothing about it. | |
| — | `GET /auth/me` | ✅ | ✅ | **Not called by any screen.** It returns `privateVehiclePlate/Model` (see §4.4). | |
| My vehicles | `PATCH /auth/private-vehicle` | ❌ | ✅ | Missing from spec. | |
| Hub list, Charging, My vehicles, Reservations, Operator profile | `GET /hubs` | ✅ | ✅ | | |
| Hub info, Hub detail, Parking booking | `GET /hubs/{hubId}` | ✅ | ✅ | | |
| Hub detail, Reservations | `GET /vehicles` | ✅ | ✅ | | |
| Parking booking, Reservations | `GET /reservations/my` | ✅ | ✅ | | |
| Reservations | `POST /reservations/vehicles` | ✅ | ✅ | Body differs, see §2. | |
| Parking booking | `POST /reservations/parking` | ✅ | ✅ | Body differs, see §2. | |
| Reservations | `POST /reservations/{id}/pickup` | ✅ | ✅ | | |
| Reservations | `POST /reservations/{id}/return` | ✅ | ✅ | FE sends only `returnHubId`; `remainingBattery`, `conditionNote` never sent. | |
| Reservations, Parking booking, Manage parking | `PATCH /reservations/{id}/cancel` | ✅ | ✅ | BE accepts **both** `POST` and `PATCH`; `/parking-reservations/{id}/cancel` is `POST` only. Pick one. | |
| Manage parking | `POST /parking-reservations/{id}/check-out` | ❌ | ✅ | Whole `/parking-reservations` group is missing from spec. | |
| Operator bundle (all operator screens) | `GET /parking-reservations` | ❌ | ✅ | | |
| Manage parking | `PATCH /parking-slots/{slotId}/status` | ❌ | ✅ | | |
| Operator bundle | `GET /parking-slots` | ❌ | ✅ | | |
| Operator bundle | `GET /charging-points` | ❌ | ✅ | | |
| Charging, My vehicles, Vehicle & charging status | `GET /charging-requests` | ✅ | ✅ | Response is snake_case, see §3. | |
| Charging | `POST /charging-requests` | ✅ | ✅ | Body differs, see §2. | |
| Charging, My vehicles | `DELETE /charging-requests/{id}` | ❌ | ✅ | BE also has `POST /charging-requests/{id}/cancel`. Pick one. | |
| Vehicle & charging status | `POST /charging-requests/{id}/start` | ❌ | ✅ | Operator only. | |
| Vehicle & charging status | `POST /charging-requests/{id}/stop` | ❌ | ✅ | Operator only. | |
| Vehicle & charging status | `PATCH /charging-requests/{id}/priority` | ✅ | ✅ | | |
| Vehicle & charging status | `PATCH /operator/vehicles/{vehicleId}/charging-priority` | ❌ | ✅ | Its 404 uses a non-standard error body, see §3. | |
| All operator screens (bundle) | `GET /operator/dashboard` | ✅ | ✅ | The FE "dashboard bundle" makes **6 calls** per load (dashboard, parking-reservations, hubs, vehicles, parking-slots, charging-points) and two screens poll it every 15 s. | |
| Incidents | `GET /incidents` | ✅ | ✅ | | |
| Incidents | `POST /incidents` | ✅ | ✅ | Body differs, see §2. | |
| Incidents | *(Assign staff)* | ❌ | ❌ | **No endpoint.** In real-API mode the FE only marks the incident `IN_PROGRESS` in browser memory; it is lost on reload. Schema already has `IN_PROGRESS`. | |
| Incidents | `PATCH /incidents/{id}/close` | ✅ | ✅ | | |
| Dispatch | `POST /dispatch/redistribute` | ✅ | ✅ | Body differs, see §2. | |
| What-if | `GET /simulations/scenarios` | ✅ | ✅ | | |
| What-if | `POST /simulations/run` | ✅ | ✅ | | |
| What-if | `POST /simulations/runs/{runId}/apply-recommendation` | ✅ | ✅ | | |

Endpoints in the spec that no screen uses: `GET /hubs/{hubId}/parking-slots`, `GET /hubs/{hubId}/charging-points`,
`GET /vehicles/{vehicleId}/availability`, `GET /auth/me`. (`POST /telemetry/ingest` is for the simulator, not the UI.)

---

## 2. Request bodies: what the FE sends vs. the spec

| Endpoint | Spec fields | FE sends in addition | FE does not send | Status |
|---|---|---|---|---|
| `POST /reservations/vehicles` | hubId, vehicleId, startTime, endTime | `userId` | — | |
| `POST /reservations/parking` | hubId, slotType, startTime, endTime | `userId`, `licensePlate` (BE uses it) | `slotType` | |
| `POST /charging-requests` | hubId, ownershipType, vehicleId, privateVehicleLabel, currentBatteryLevel, targetBatteryLevel, scheduledStart, scheduledEnd | `userId`, `connectorType` | — | |
| `POST /incidents` | hubId, targetType, vehicleId, chargingPointId, severity, title, description | `parkingSlotId` (column added in `schema.sql`) | — | |
| `POST /dispatch/redistribute` | sourceHubId, destinationHubId, vehicleCount, reason | `assignedStaff`, `allocations[]` (BE uses both) | — | |

`userId` in a body should be **ignored** by the BE — the user must come from the JWT (`req.user.id`), otherwise
a user could act for someone else. Please confirm the BE does this, then the FE can stop sending it.

---

## 3. Response format

1. **Field naming is mixed.** Hubs, vehicles, `/auth/me` alias columns to camelCase; charging requests,
   incidents and several operator routes return raw MySQL rows in snake_case (`request_code`, `scheduled_start`,
   `hub_id`…). The FE currently reads both (`r.requestCode ?? r.request_code`). Proposal: **camelCase everywhere**,
   then the FE fallbacks can be removed.
2. **Error body.** Standard shape is `{ success: false, error: { code, message } }`.
   `PATCH /operator/vehicles/{vehicleId}/charging-priority` returns `{ success: false, message }` for 404,
   so the FE shows "HTTP Error 404" instead of the message.
3. The spec only documents success codes for most endpoints. Please add the error codes each endpoint can return
   (400 validation, 401, 403, 404, 409 conflict) so the FE can show the right message.

---

## 4. Data the UI shows that is not backed by the API

| # | Screen | What | Where it lives today | Question for BE | Status |
|---|---|---|---|---|---|
| 4.1 | Incidents | "Assign staff" (`OPEN → IN_PROGRESS`) | Browser memory only | Add `PATCH /incidents/{id}/assign`? | |
| 4.2 | Operator profile | Name, staff ID, phone, assigned hub | `localStorage` | Is a profile API planned, or is this screen display-only? | |
| 4.3 | Vehicle & charging status | Manual priority override shown in the table | `sessionStorage` + API call | Should `GET` responses include the saved override so it survives reload? | |
| 4.4 | My vehicles, Charging | Private vehicle list (name, type, battery) | `sessionStorage`, seeded with a fake `PV-018` | `users` has only one `private_vehicle_plate/model`, no battery. Use `GET /auth/me` + `PATCH /auth/private-vehicle` and drop battery, or add a vehicles table? | |

---

## 5. Mock mode (`VITE_USE_MOCK_API=true`)

The FE track must keep working on mock data until every BE endpoint is ready.

- Every `api/index.js` function now has a mock. `operatorApi.updateVehicleChargingPriority` was missing and has been added.
- `startCharging`, `stopCharging`, `parkingCheckOut` and `getParkingBookings` return fixed stub values in mock mode
  (they do not change mock data).
- Mock data should follow the spec. When the spec changes after this meeting, `api/mockData.js` and
  `api/mockServer.js` must be updated in the same PR.

---

## 6. Decisions (fill in during the meeting)

| # | Decision | Owner | Done in PR |
|---|---|---|---|
| | | | |
