# Contributing to Arenula

## Setup

```bash
git clone https://github.com/Nyx000/Arenula-MCP.git
cd Arenula-MCP
npm run setup    # installs deps and builds api/ and docs/
```

The Editor plugin is a C# project — open it in the s&box editor, not Node.js.

## Project Structure

```
arenula-mcp/
  api/          Node.js — offline API type reference (MIT)
  docs/         Node.js — narrative docs fetcher (MIT)
  editor/       C# — s&box editor plugin (GPL-3.0)
```

## Building

```bash
npm run build              # builds both api/ and docs/
npm run build --prefix api # build just api
npm run build --prefix docs # build just docs
```

## Code Style

- TypeScript with strict mode
- No semicolons (follow existing style)
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`

## Pull Requests

- One PR per feature or fix
- Include which server(s) are affected
- Make sure `npm run build` passes
- Follow existing patterns in the codebase

## License

By contributing, you agree that your contributions will be licensed under the same license as the component you're modifying (MIT for api/docs, GPL-3.0 for editor).
