# Network Egress Register

**Status:** Normative (Invariant I-10). Every Plaster component that can initiate an external network request **must** be listed here *before* it is merged. Code that isn't listed must not perform network I/O.

"Plaster-initiated" means a request caused by Plaster's code. The website's own requests are excluded, as are browser-managed extension updates from the store (which happen outside Plaster's code; they are noted separately below for transparency).

## Runtime components

| Component | Package | Trigger | Destination | Data sent | Consent | Status |
|---|---|---|---|---|---|---|
| *(none)* | | | | | | v0.1.0 contains no network code. Enforced by `tests/security/static.test.ts` and verified at runtime by `tests/integration/extension.test.mjs` |

**Planned (not approved, needs design; see `open-decisions.md`):**

| Component | Notes |
|---|---|
| Optional online alternative discovery | `packages/discovery` only. User-initiated with explicit disclosure. Payload to be decided (D-15). |
| Optional knowledge-base updates | Only if the team chooses an update channel separate from store releases (D-9). |

## Outside Plaster's code (for transparency)

| Activity | Who initiates | What it reveals |
|---|---|---|
| Extension auto-update | Browser, to the extension store | That Plaster is installed, plus the browser and version metadata. Plaster does not control this. |

## Build-time and development tooling

Build scripts (for example, downloading tracker lists to bundle into a release) may use the network. They run on developer or CI machines, never in the user's browser, and are listed here once they exist.

| Script | Destination | Purpose |
|---|---|---|
| *(none yet)* | | |

Development-only tooling: `npm install` contacts the npm registry, and the integration tests run a **local** proxy on `127.0.0.1` that serves fixtures and refuses all other traffic. Neither ships to users.
