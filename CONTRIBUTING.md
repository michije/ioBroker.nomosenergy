# Contributing to ioBroker.nomosenergy

Thank you for your interest in contributing to the ioBroker.nomosenergy adapter!

## Development Setup

### Prerequisites
- Node.js >= 18
- ioBroker environment for testing
- Nomos Energy API credentials (get from https://nomos.energy/dashboard)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/michije/ioBroker.nomosenergy.git
   cd ioBroker.nomosenergy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. For development with watch mode:
   ```bash
   npm run watch
   ```

## Project Structure
- `src/main.ts`: Main adapter logic (TypeScript)
- `admin/`: Admin UI files (HTML, CSS, translations)
- `test/`: Test files (currently basic setup)
- `docs/`: Documentation

## Testing

### Run Tests
```bash
npm test
```

### Testing with ioBroker
1. Build the adapter: `npm run build`
2. Copy to ioBroker node_modules or use symlink
3. Configure instance in ioBroker Admin
4. Start instance and monitor logs

**Note:** During development, provide your own API credentials for testing. Do not commit real credentials.

## Code Guidelines

### TypeScript
- Use strict type checking
- Add JSDoc comments for functions/methods
- Follow existing naming conventions

### Commits
- Use descriptive commit messages
- Reference issue numbers when applicable
- Keep changes focused and atomic

### Pull Requests
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Build: `npm run build`
6. Update documentation if needed
7. Commit your changes
8. Push to your fork
9. Create a Pull Request

### API Credentials
- Use test/demo credentials for development
- Never commit real API credentials
- Educate contributors about credential security

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for code
- Update changelog in io-package.json for releases

## Issues

### Bug Reports
- Use the bug report template
- Include ioBroker version, Node.js version, and adapter version
- Provide logs with error details
- Steps to reproduce

### Feature Requests
- Clearly describe the feature and use case
- Consider if it fits the adapter's scope

## Code of Conduct

Be respectful and constructive in all interactions. This is an open source project and we appreciate all contributions.

## Support

For questions about contributing, open an issue or discuss in the ioBroker community forum.

Thank you for helping improve the nomosenergy adapter!
