# Zen Workspace Backend Roadmap

## Current State

This project is currently a small `Node.js + Express + MySQL` backend for task and note management. It already has:

- Session-based token authentication backed by `user_sessions`
- Protected REST APIs for dashboard, profile, tasks, notes, and metadata
- MySQL schema with foreign keys, unique constraints, and some transactional writes
- A simple health endpoint and HTML screens wired to the backend

Current maturity: `Learning Project -> Early MVP`

Why:

- The main domain flow exists and the schema is already more structured than a typical student CRUD app.
- Security, validation, logging, error contracts, testing, and deployment hardening are still thin.
- The app is usable locally, but not yet production-like.

## Target

Move the project to a `production-like MVP` without Docker.

That means:

- Main features are complete and stable
- Authentication/session handling is safer
- Data writes are consistent
- Errors are predictable
- Logs are usable for debugging
- There is at least basic automated test coverage
- The app can be deployed as a normal Node service with environment-based config

## Phase 1: Foundation Hardening

### Objectives

- Make requests traceable
- Standardize error responses
- Improve basic operational visibility

### Tasks

- Add request IDs to every request
- Add structured request logging
- Standardize error response payloads
- Improve `/health` output
- Add clean startup/shutdown behavior

### Why this matters

Without this layer, debugging later auth, validation, and data bugs is much harder.

### Expected outcome

The app becomes easier to observe, debug, and run outside local development.

## Phase 2: Input Validation and API Contracts

### Objectives

- Reject invalid input early
- Make response contracts predictable

### Tasks

- Add shared validation helpers
- Validate route params and request bodies
- Normalize invalid payload handling
- Document API payloads in the README or an API spec

### Why this matters

It protects the database, reduces edge-case bugs, and improves frontend integration quality.

### Expected outcome

The API stops accepting malformed data and starts behaving consistently.

## Phase 3: Authentication and Session Security

### Objectives

- Make auth safer while keeping the current architecture

### Tasks

- Add session expiry cleanup
- Track session metadata such as last-used time, IP, and user agent
- Add logout-all-sessions support
- Tighten password rules
- Add simple brute-force protection for login

### Why this matters

The current token flow is workable, but session controls are still basic.

### Expected outcome

Authentication becomes closer to a real application instead of a demo flow.

## Phase 4: Feature Completion and Data Integrity

### Objectives

- Finish missing task/note/profile features
- Protect important writes with clear constraints

### Tasks

- Review missing CRUD endpoints and update flows
- Add transactions where multiple related writes must succeed together
- Add missing indexes discovered from actual query patterns
- Strengthen ownership checks on all user-scoped operations

### Why this matters

The app should be complete and correct before optimization.

### Expected outcome

Core features are complete and data remains coherent under normal usage.

## Phase 5: Testing

### Objectives

- Prevent regressions

### Tasks

- Add unit tests for helpers and security utilities
- Add integration tests for login, session, profile, tasks, and notes
- Add a small seeded test database flow

### Why this matters

Testing is the main gap between a coursework project and a reliable backend.

### Expected outcome

Changes can be made with much higher confidence.

## Phase 6: Deployment Readiness Without Docker

### Objectives

- Run the app cleanly on a VM or local server

### Tasks

- Add `development` and `production` config handling
- Prepare process startup instructions for `pm2` or `systemd`
- Add reverse proxy guidance if serving behind Nginx
- Add backup and database migration discipline

### Why this matters

Not using Docker is fine, but deployment still needs to be repeatable.

### Expected outcome

The app can be deployed in a stable, documented way.

## Priority Checklist

### Must Have

- Structured logging and request IDs
- Standardized error responses
- Input validation
- Better session controls
- Missing feature completion
- Basic automated tests

### Should Have

- Session metadata and cleanup
- Login rate limiting
- More complete health checks
- Deploy guide for non-Docker environments

### Nice to Have

- API documentation tooling
- Monitoring dashboard
- Background cleanup jobs

## If Time Is Limited

Do these first:

1. Finish foundational logging and error handling
2. Add validation for auth/profile/task/note inputs
3. Improve session security and cleanup
4. Add integration tests for login and task creation

## Execution Order

The project should now proceed in this order:

1. Foundation hardening
2. Validation and API cleanup
3. Auth/session improvements
4. Feature completion
5. Tests
6. Deployment preparation
