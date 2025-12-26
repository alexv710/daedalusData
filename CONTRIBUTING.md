# Contributing to DaedalusData

Thank you for your interest in contributing to DaedalusData! This document provides guidelines for contributing to the project.

## Ways to Contribute

### Reporting Bugs

If you encounter a bug, please [open an issue](https://github.com/alexv710/daedalusData/issues/new) with:

- A clear, descriptive title
- Steps to reproduce the problem
- Expected vs. actual behavior
- Your environment (OS, Docker version, browser)
- Screenshots if applicable

### Suggesting Features

Have an idea for improvement? Open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Submitting Pull Requests

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/your-feature`)
3. **Make your changes** and test them locally with `docker compose up`
4. **Commit** with clear messages describing your changes
5. **Push** to your fork and open a Pull Request

#### Pull Request Guidelines

- Keep changes focused and atomic
- Update documentation if needed
- Ensure the application runs correctly with `docker compose up`
- Reference any related issues in your PR description

## Getting Help

- **Bug reports**: Use the [issue tracker](https://github.com/alexv710/daedalusData/issues)
- **Research collaborations**: Contact the maintainer via the issue tracker

## Development Setup

```bash
# Clone your fork
git clone git@github.com:YOUR-USERNAME/daedalusData.git
cd daedalusdata

# Start the development environment
docker compose up -d

# Access the services
# Frontend: http://localhost:3000
# Jupyter:  http://localhost:8888
```

## Project Structure

```
DaedalusData/
├── frontend/      # Nuxt.js frontend application
├── notebooks/     # Jupyter notebooks for analysis
├── data/          # Data directory (mounted volume)
├── docs/          # Documentation and images
└── scripts/       # Utility scripts
```

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming environment for everyone.

## Maintainer Note

This project is maintained with limited time availability. While I welcome contributions and feedback, response times may vary. For research collaborations or specific use cases, please open an issue or contact me directly to start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the [GNU General Public License v3.0](LICENSE).
