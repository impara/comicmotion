# ComicMotion Cursor Rules

## 1. Project Structure & Conventions

- Use a monorepo structure if multiple services or packages are present (e.g., frontend, backend, shared).
- All new code must be TypeScript.
- Organize code by feature/module (e.g., `auth/`, `upload/`, `render/`, `billing/`).
- Use Atomic Design principles for React components.

## 2. Code Quality

- Enforce ESLint and Prettier for all code. No lint or format errors in PRs.
- All code must be covered by unit or integration tests (target ≥80% coverage for critical paths).
- Use strict TypeScript settings (`strict: true` in tsconfig).

## 3. API & Data Contracts

- All API endpoints must be typed end-to-end (tRPC or OpenAPI).
- Validate all inputs using Zod or a similar schema validation library.
- Document all public API endpoints and data models.

## 4. Security & Compliance

- Never commit secrets or credentials. Use Vault or environment variables.
- All authentication must use Clerk and JWTs as described in the TSD.
- Follow OWASP and SOC2 guidelines for all new features.
- Implement role-based access control for admin and user routes.

## 5. Infrastructure & DevOps

- All infrastructure as code (IaC) must be in version control (e.g., Terraform for cloud resources).
- CI/CD pipelines must run lint, type-check, tests, and security scans before deploy.
- Use feature branches and require PR review for all merges to main.

## 6. Observability & Error Handling

- All services must implement structured logging.
- Integrate Sentry for error tracking and Grafana for monitoring.
- All errors must be handled gracefully with user-friendly messages.

## 7. Accessibility & UX

- All UI must meet WCAG 2.1 AA accessibility standards.
- Use responsive design and support dark mode.
- Provide loading skeletons and clear progress feedback for async operations.

## 8. Documentation

- All new modules and features must include README or in-code documentation.
- Update architectural diagrams and data models as the system evolves.

## 9. Task Management

- All new work must be tracked as a task or subtask in Task Master.
- Link PRs to relevant tasks for traceability.
