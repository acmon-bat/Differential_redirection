# Working rules for agents on Plaster

1. Read `docs/invariants.md` before changing code. The invariants are non-negotiable.
2. `packages/core` must stay free of browser APIs, the DOM, UI frameworks and networking.
3. Never add code that makes a network request unless it is in `packages/discovery` and registered in `docs/network-egress-register.md`.
4. Never read form values or request bodies.
5. Unknown evidence must never improve a score.
6. Don't add dependencies without justification. Prefer zero-dependency solutions in `core`.
7. For decisions with security, privacy, maintenance or architectural consequences: present the options, trade-offs and a recommendation, and add them to `docs/open-decisions.md` instead of deciding silently.
8. Use British English in documentation and user-facing text.
9. Never run `git commit`, `git push` or history-rewriting commands; the project owner commits.

## Commands
- `npm run typecheck`: strict TypeScript for core, knowledge and extension
- `npm test`: unit + static security tests (no browser needed)
- `npm run test:integration`: builds the test extension and runs Chromium end-to-end tests (needs Playwright)
- `npm run build:extension`: production build to `dist/extension`
- `npm run demo:cli -- <snapshot.json>`: assess a snapshot from the command line
