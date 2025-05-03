## CI/CD Pipeline

This project uses **GitHub Actions** for continuous integration and deployment. The workflow is defined in `.github/workflows/ci.yml` and includes steps for:

- Linting (ESLint)
- Testing (Jest/React Testing Library)
- Building the application (with Turborepo support)
- (Optional) Deployment step (add your hosting provider)

### Monorepo Support

- The workflow is optimized for monorepo structure using Turborepo.
- Dependency caching and selective builds are supported out of the box.

### Branch Protection

- It is recommended to enable branch protection rules for `main` and `develop` branches:
  - Require status checks to pass before merging (CI must succeed)
  - Require pull request reviews before merging
  - Restrict force pushes and deletions

### Deployment

- Add your deployment step in `.github/workflows/ci.yml` (e.g., Vercel, AWS, GCP, etc.)
- Ensure your deployment secrets are configured in the repository settings.
