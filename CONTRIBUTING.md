# Contributing

Tools are **generated from the OpenAPI spec**: the server builds its tool list at startup from the operation manifest exported by `@advernue/sdk` (itself generated from the spec). `spec/openapi.json` here is a copy for reference.

## Regenerate / update

1. In the SDK repo: replace `spec/openapi.json`, run `pnpm generate`, then release or rebuild it.
2. Here: update `spec/openapi.json` and the `@advernue/sdk` dependency (or rebuild the sibling checkout), then `pnpm typecheck && pnpm test`.

The set of POST operations treated as read-only (no `confirm` gate) lives in `src/tools.ts` (`READ_ONLY_POSTS`, plus the whole `analytics` tag); review it when new operations appear.

## Development

```sh
# requires ../advernue-node checked out and built while the dep is file:
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Releases: tag `vX.Y.Z` on `main`; the release workflow publishes with provenance via npm trusted publishing (OIDC, no token).
