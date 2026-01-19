# Ralphy CLI - Coding Standards

## TypeScript Strictness

- **Never use `any`** - use `unknown` when type is uncertain, then validate with Zod
- All strict flags are enabled in tsconfig
- Explicit return types on all exported functions
- Use Zod for runtime validation of external data (API responses, config files)

## Functional Approach

- **Prefer pure functions** without side effects where possible
- Separate pure logic from IO/side effects
- This makes unit testing trivial and cheap

### Example Structure

```typescript
// Pure function (easy to test)
function parseLinearIssue(raw: unknown): Result<LinearIssue, ParseError> {
  // Validation and transformation only
}

// Impure function (thin wrapper, minimal logic)
async function fetchIssue(id: string): Promise<LinearIssue> {
  // IO only, delegates to pure functions for parsing
}
```

## Project Structure

```
src/
├── index.ts           # CLI entry (commander.js)
├── commands/          # CLI command handlers
├── services/          # Business logic and external integrations
│   ├── linear/        # Linear API
│   ├── claude/        # Claude Code execution (future)
│   └── config/        # Config management
├── types/             # Zod schemas and TypeScript types
└── utils/             # Logging, spinners, tables
```

## Testing

- High unit test coverage for pure functions
- Integration tests for IO boundaries
- Use Vitest for fast test execution
- Mock external services at boundaries only

## Error Handling

- Use Result types for recoverable errors in pure functions
- Throw for unexpected/programmer errors
- Always provide user-friendly error messages in CLI output

## Naming Conventions

- Files: kebab-case (e.g., `rate-limiter.ts`)
- Types/Interfaces: PascalCase (e.g., `LinearIssue`)
- Functions/Variables: camelCase (e.g., `parseIssue`)
- Constants: SCREAMING_SNAKE_CASE for true constants

## Commands

- `npm run dev` - Run CLI in development mode
- `npm run build` - Compile TypeScript
- `npm run test` - Run tests
- `npm run typecheck` - Type check without emitting
