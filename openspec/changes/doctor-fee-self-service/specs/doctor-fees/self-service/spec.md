## Purpose

Gives each logged-in doctor a read-only view of their own doctor fees per period and guarantees doctors can never see another doctor's fee or payroll data.

## ADDED Requirements

### Requirement: Doctor can list own fee periods

The system SHALL expose an endpoint (`GET /me/doctor-fees`) that returns, for the logged-in doctor, the list of periods in which that doctor has fee data (transactions or a period summary), newest period first, each with its calculation status, plus a convenience `latest_period` field.

#### Scenario: Doctor with existing periods lists them

- **WHEN** a doctor user requests their own fee periods
- **THEN** the response lists only periods where the doctor has records, ordered newest first, and includes `latest_period`

#### Scenario: Doctor without any record

- **WHEN** a doctor user who has never had transactions requests their own fee periods
- **THEN** the response contains an empty period list and `latest_period` is null

### Requirement: Doctor can view own fee summary for a period

The system SHALL expose an endpoint (`GET /me/doctor-fees/:period`) returning, for the logged-in doctor and a valid `YYYY-MM` period, a summary with the doctor's name, bank/payment details, period status (empty, not calculated, draft, or locked), fee totals (treatment fee, ortho fee, total fee), billing total, deduction, tax, transfer amount, calculated-at timestamp, and transaction/review counts. When the doctor has no summary or transactions in that period, the system SHALL return an empty-state summary with status `empty` and zero amounts.

#### Scenario: Doctor views a calculated period

- **WHEN** a doctor requests a period where a period summary exists for that doctor
- **THEN** the response includes that doctor's own summary amounts and status

#### Scenario: Doctor views a period without records

- **WHEN** a doctor requests a well-formed period where the doctor has no transactions and no summary
- **THEN** the response is 200 with an empty-state summary (status `empty`, zero amounts, empty transaction list)

#### Scenario: Malformed period is rejected

- **WHEN** any user requests a doctor fee period that is not `YYYY-MM`
- **THEN** the system rejects the request with a 400 response

### Requirement: Doctor can view own transactions in a period

The period detail SHALL include the individual transaction rows that generated the doctor's fee: date, patient name, treatment name, quantity, computed fee amounts, total bill, and review flag. Rows of other doctors SHALL NOT appear.

#### Scenario: Transactions are limited to the requesting doctor

- **WHEN** a doctor requests period detail and another doctor has transactions in the same period
- **THEN** only the requesting doctor's transactions are returned

### Requirement: Doctor fee view is read-only

A doctor account SHALL NOT be able to create, update, delete, import, calculate, lock, or unlock any doctor-fee or treatment-history data, and SHALL NOT be able to request the aggregate fee export or the per-doctor ZIP export used by staff.

#### Scenario: Doctor attempts a management action

- **WHEN** a doctor calls a transaction create/update/delete, import, calculate, lock/unlock, aggregate fee-export, or ZIP-export endpoint
- **THEN** the system rejects the request with a 403 response

### Requirement: Doctor can export own fee recap

The system SHALL expose `GET /me/doctor-fees/:period/export?format=pdf|xlsx` that generates a single-doctor fee recap for the logged-in doctor's own period data. The generated file SHALL contain only that doctor's summary and transactions, SHALL be downloadable with an appropriate content type, and SHALL be archived like other generated reports. When the doctor has no summary and no transactions for the period, the system SHALL respond 404.

#### Scenario: Doctor exports own period PDF

- **WHEN** a doctor with a calculated summary requests `GET /me/doctor-fees/2026-07/export?format=pdf`
- **THEN** the response is a PDF containing only that doctor's fee recap for 2026-07

#### Scenario: Doctor exports own period XLSX

- **WHEN** a doctor with a calculated summary requests `GET /me/doctor-fees/2026-07/export?format=xlsx`
- **THEN** the response is an XLSX workbook containing only that doctor's recap rows and detail rows for 2026-07

#### Scenario: Doctor exports an empty period

- **WHEN** a doctor requests an export for a well-formed period where the doctor has no summary and no transactions
- **THEN** the system responds 404 with a message that no fee data exists for the period

#### Scenario: Doctor cannot export another doctor's recap

- **WHEN** a doctor attempts to download the aggregate `/reports/doctor-fees` export or any ZIP/per-doctor staff export
- **THEN** the system responds 403

### Requirement: Doctor dashboard shows own income overview and month comparison

The system SHALL expose `GET /me/doctor-dashboard` (doctor-only, optional `period` in `YYYY-MM`, defaulting to the doctor's latest period with data) returning only the logged-in doctor's data: a summary of the selected period (status, fee totals, transfer amount, billing, transaction and review counts), the same summary shape for the immediately previous calendar month when the doctor has data there (or null), a small list of recent own transactions, and a small list of the doctor's own recent audit entries. This data feeds the doctor's home dashboard, including a current-vs-previous income comparison chart.

#### Scenario: Doctor opens dashboard with data

- **WHEN** a doctor requests `/me/doctor-dashboard` and has fee data for the latest period
- **THEN** the response includes the doctor's current summary, previous-month summary (or null), recent own transactions, and recent own audit entries

#### Scenario: Doctor requests a specific period

- **WHEN** a doctor requests `/me/doctor-dashboard?period=2026-07`
- **THEN** the current summary reflects 2026-07 and the previous summary reflects 2026-06

#### Scenario: Dashboard never exposes another doctor's data

- **WHEN** other doctors have transactions in the same or previous period
- **THEN** the response contains only the requesting doctor's summary, transactions, and audit entries

### Requirement: Fee recap presentation matches the payroll self-service page

The doctor's "Fee Dokter Saya" recap for a period SHALL present the same visual hierarchy as the "Payroll Saya" page: the total transfer amount is the most prominent figure, the component amounts (fee perawatan, fee ortho/behel, tagihan, potongan, pajak) are compact cards arranged in a responsive multi-column grid, payment/bank details sit in an adjacent card with the export actions, and the period's own transactions render below as a read-only table.

#### Scenario: Recap layout mirrors payroll slip

- **WHEN** a doctor views a period recap on the fee page
- **THEN** the total transfer is displayed with the same prominent typography as payroll's total, components are compact multi-column cards, and transaction rows show only the doctor's own records

### Requirement: Doctor cannot see other doctors' fee or payroll data

Management endpoints that return cross-doctor fee data (`/doctor-transactions`, `/doctor-periods/:period/summary`, `/doctor-periods/:period/overview`, doctor-fee report exports) SHALL require an `admin` or `operator` role. Payroll management and payroll self-service data SHALL remain invisible to doctor accounts. A doctor's own period views SHALL be derived server-side from the linked doctor record; client-supplied doctor filters SHALL NOT widen the view.

#### Scenario: Doctor requests the management summary endpoint

- **WHEN** a doctor requests `/doctor-periods/:period/summary` or `/doctor-periods/:period/overview`
- **THEN** the system responds 403

#### Scenario: Doctor requests another doctor's transactions via filter

- **WHEN** a doctor requests `/doctor-transactions?doctor_id=<another doctor>`
- **THEN** the system responds 403 rather than returning filtered rows

#### Scenario: Operator and admin behavior is unchanged

- **WHEN** an admin or operator requests the management fee endpoints
- **THEN** the existing response shapes and authorization behavior are preserved
