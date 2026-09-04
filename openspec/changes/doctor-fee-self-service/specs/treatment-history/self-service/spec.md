## Purpose

Lets a logged-in doctor browse their own treatment history read-only, with the same server-side isolation that applies to their fee views.

## ADDED Requirements

### Requirement: Doctor can browse own treatment history

The system SHALL expose an endpoint (`GET /me/doctor-transactions`) that returns treatment transactions where the requesting doctor is the performing doctor, newest first. An optional `period` query parameter (`YYYY-MM`) SHALL narrow the results to that period; when omitted, the system SHALL return the doctor's transactions across all periods. Each row SHALL carry the same display fields staff see (date, patient, treatment, quantity, fee/bill amounts, review flag). The doctor id SHALL always be resolved server-side from the linked doctor record.

#### Scenario: Doctor browses a period

- **WHEN** a doctor requests `GET /me/doctor-transactions?period=2026-07`
- **THEN** the response contains only that doctor's transactions for 2026-07, newest first

#### Scenario: Doctor browses all periods

- **WHEN** a doctor requests `GET /me/doctor-transactions` without a period
- **THEN** the response contains only that doctor's transactions across all periods, newest first

#### Scenario: Another doctor's rows never appear

- **WHEN** a doctor browses their history and other doctors have transactions in the same period or date range
- **THEN** only the requesting doctor's rows are returned

#### Scenario: Doctor account is not linked to a doctor

- **WHEN** a doctor user without a linked doctor record requests their history
- **THEN** the system responds with a 403/409 error explaining the account is not linked to a doctor

### Requirement: Doctor cannot mutate treatment history

A doctor account SHALL NOT be able to create, edit, delete, import, review-flag, or otherwise change treatment transactions, whether their own or others'.

#### Scenario: Doctor attempts to create or edit a transaction

- **WHEN** a doctor calls the transaction create/update/delete/import endpoints
- **THEN** the system rejects the request with a 403 response

### Requirement: Staff treatment-history behavior is unchanged

Existing staff-facing treatment-history endpoints and permissions (`/doctor-transactions` management endpoints for `admin` and `operator`) SHALL keep their current shapes and authorization.

#### Scenario: Operator records a treatment

- **WHEN** an operator creates or edits a treatment transaction via `/doctor-transactions`
- **THEN** the existing behavior is preserved
