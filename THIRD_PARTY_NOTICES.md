# Third-Party Notices

Plaster's own code, documentation and data are licensed under the Apache License 2.0 (see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)).

**The Apache License does not replace or override the licences of the third-party material below.** Each item stays under its own terms.

## Data included in the source tree

| Material | Location | Source | Licence | Notes |
|---|---|---|---|---|
| Subset of public suffixes (~45 entries such as `co.uk`, `github.io`) | `packages/knowledge/src/public-suffixes.ts` (the suffix entries) | [Public Suffix List](https://publicsuffix.org), Mozilla Foundation and contributors | [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/) | The entries are attributed to the Public Suffix List and remain under MPL-2.0 to the extent they are protectable. The surrounding Plaster code is Apache-2.0. If the full list is bundled in future, include the MPL-2.0 notice with it. |

**Not third-party material:**
- **Tracker seed** (`packages/knowledge/src/trackers.ts`): written for Plaster from public vendor documentation; not copied from any third-party tracker list. Company and product names are used only descriptively, to identify services, and may be trademarks of their owners.
- **Test fixtures** (`tests/integration/fixtures/`, `fixtures/snapshots/`): written for Plaster.

## Software dependencies

Plaster has **no runtime dependencies**. The built extension (`dist/extension`) contains only Plaster's own code. The following **development-only** tools are installed by `npm ci`. They are not redistributed with Plaster:

| Package | Version | Licence |
|---|---|---|
| `typescript` | 5.9.3 | Apache-2.0 |
| `esbuild` (and platform binaries `@esbuild/*`) | 0.28.2 | MIT |
| `@types/chrome`, `@types/node`, `@types/filesystem`, `@types/filewriter`, `@types/har-format` | see `package-lock.json` | MIT |
| `undici-types` (via `@types/node`) | 6.21.0 | MIT |

The integration tests use **Playwright** (Apache-2.0) and its Chromium build from the development environment. They are not a project dependency and are not redistributed.

The `LICENSE` text was copied from the Apache License 2.0 distributed with `typescript`.
