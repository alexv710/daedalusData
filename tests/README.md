# Tests

This directory contains tests for DaedalusData.

## Python Tests

The Python tests validate data formats and structures used by DaedalusData. They ensure that data files conform to the expected schemas documented in the README.

### Running Tests

```bash
# From the project root (requires pytest)
pip install pytest numpy
pytest

# Or run inside the Docker/Podman container
docker compose exec app python -m pytest /app/tests
podman-compose exec app python -m pytest /app/tests

# Alternative: use podman exec with container name
podman exec daedalusdata_app_1 python -m pytest /app/tests
```

### Test Categories

| Test Class | Purpose |
|------------|---------|
| `TestMetadataFormat` | Validates metadata JSON structure |
| `TestProjectionFormat` | Validates projection file format |
| `TestFeatureFormat` | Validates NPZ feature files |
| `TestLabelFormat` | Validates label alphabet structure |
| `TestImageDirectory` | Validates image files and naming |

> **Note:** Some tests will be skipped if the corresponding data files don't exist (e.g., before running the Jupyter notebooks).

## Frontend Tests

The frontend uses [Vitest](https://vitest.dev/) for testing the Nuxt.js application.

### Running Frontend Tests

```bash
cd frontend

# Run tests
pnpm test

# Run tests with coverage
pnpm test:ci

# Run tests with UI
pnpm test:ui
```

### Test Location

Frontend tests are co-located with their source files:
- `frontend/server/api/**/*.test.ts` — API route tests

## Continuous Integration

Tests are designed to run in CI environments:

```bash
# Python tests
pytest --tb=short

# Frontend tests
cd frontend && pnpm test:ci
```
