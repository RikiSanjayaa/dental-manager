## Purpose

Lets the clinic provision login accounts for doctors and lets doctors authenticate with their own identity linked to a master doctor record.

## ADDED Requirements

### Requirement: User accounts support the doctor role

The system SHALL support three user roles — `admin`, `operator`, and `doctor`. A `doctor` user SHALL be linked to exactly one master doctor record via a `doctor_id` reference on the user account. The system SHALL enforce that no two user accounts link to the same doctor record, and that a `doctor` account cannot be created or updated without a valid `doctor_id`.

#### Scenario: Admin creates a doctor account

- **WHEN** an admin creates a user with role `doctor` and a `doctor_id` that references an existing doctor record
- **THEN** the user is stored with role `doctor`, the doctor link is saved, and the created user is returned without any password hash

#### Scenario: Doctor account requires a linked doctor

- **WHEN** an admin tries to create a user with role `doctor` but no `doctor_id`
- **THEN** the system rejects the request with a 400 response explaining the doctor link is required

#### Scenario: Doctor link must reference an existing doctor

- **WHEN** an admin creates or updates a user with a `doctor_id` that does not exist in the doctor master data
- **THEN** the system rejects the request with a 400 response

#### Scenario: One account per doctor

- **WHEN** an admin tries to create or update a user so that a doctor record already linked to another user account gets linked again
- **THEN** the system rejects the request with a 400 response

#### Scenario: Role changed to doctor without doctor link

- **WHEN** an admin updates an existing user to role `doctor` while leaving the doctor link empty
- **THEN** the system rejects the request with a 400 response

### Requirement: Admin can manage doctor accounts in User Management

The user list SHALL show the linked doctor for accounts that have one, and the create/edit forms SHALL let admins pick the role and, for role `doctor`, pick the doctor to link from active doctor master records.

#### Scenario: User list shows linked doctor

- **WHEN** an admin opens User Management
- **THEN** every row displays the account role and, for doctor-linked accounts, the linked doctor's name

#### Scenario: Editing a doctor account link

- **WHEN** an admin edits a doctor account and selects a different doctor or role
- **THEN** the update is validated with the same rules as creation and, when valid, is saved

### Requirement: Doctor identity is returned on login

After login, the identity payload returned by `/auth/me` SHALL include the user's role and, for doctor accounts, the linked doctor's id and name. The frontend SHALL label doctor accounts as "Dokter" wherever roles are displayed.

#### Scenario: Doctor logs in and reads own identity

- **WHEN** an active doctor user authenticates and requests `/auth/me`
- **THEN** the response includes role `doctor`, the doctor's `doctor_id`, and the linked doctor's name

#### Scenario: Inactive user cannot log in

- **WHEN** a disabled user account attempts to log in
- **THEN** the system rejects the login with 401, regardless of role

### Requirement: Doctor accounts do not see payroll self-service

Doctor accounts have no employee link and SHALL NOT access payroll self-service endpoints. Requests by a doctor to `/me/payroll*` or `/me/dashboard` SHALL be rejected with a 403 response, not a data response.

#### Scenario: Doctor requests payroll self-service

- **WHEN** a doctor user requests `/me/payroll/:period`
- **THEN** the system responds 403 with a message that the account is not an employee/operator account

### Requirement: Revoking doctor access is done through the user account

The system SHALL treat the user account as the source of truth for login access. Deactivating a doctor master record SHALL NOT by itself disable that doctor's user account.

#### Scenario: Doctor master is deactivated but account stays active

- **WHEN** an admin deactivates a doctor record in master data while its linked user account is still active
- **THEN** the doctor can still log in and the identity payload still resolves to the deactivated doctor record

#### Scenario: Admin disables a doctor account

- **WHEN** an admin deactivates the user account of a doctor
- **THEN** that account can no longer log in
