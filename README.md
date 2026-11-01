# @advernue/mcp

A stdio [MCP](https://modelcontextprotocol.io) server for the [Advernue](https://advernue.com) API: one request shape over ~200 ad platforms, exposed as tools to any MCP client. Built on [`@advernue/sdk`](https://github.com/advernue/advernue-node).

> **Before publishing:** `package.json` depends on `@advernue/sdk` via `file:../advernue-node`. Switch it to the published semver range once the SDK is on npm, and drop the "Build sibling" step from `.github/workflows/*.yml`.

## Use

```json
{
  "mcpServers": {
    "advernue": {
      "command": "npx",
      "args": ["-y", "@advernue/mcp"],
      "env": { "ADVERNUE_API_KEY": "adv_..." }
    }
  }
}
```

`ADVERNUE_API_KEY` is required for tool calls; `ADVERNUE_BASE_URL` optionally overrides `https://api.advernue.com`.

## Tools

One tool per API operation, named `<tag>_<operation>` (for example `campaigns_list`, `analytics_compare`, `crosspost_launch`). Inputs are JSON Schema taken from the OpenAPI spec: path and query parameters are top-level fields, the request body is the `body` field.

- **Reads** (GET, plus analytics and preview/simulate style POSTs) are annotated `readOnlyHint: true` and run immediately.
- **Writes default to a dry run.** Where the API supports `dry_run`, a write without `confirm: true` is sent as a dry run (validate and preview only). For writes without a server-side dry run, nothing is sent and the tool returns a preview of the request. Set `confirm: true` to execute for real.
- Writes also accept `idempotencyKey` (generated when omitted).
- API errors come back as tool results with `isError: true` and the `{ status, code, message, details }` envelope.

## License

MIT
