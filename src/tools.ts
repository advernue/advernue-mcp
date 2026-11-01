import { Advernue, AdvernueError, componentSchemas, operations, type OperationMeta } from "@advernue/sdk";

export interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; $defs?: Record<string, unknown> };
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean };
}

/** POST operations that only read or preview: no side effects, so no `confirm` gate. */
const READ_ONLY_POSTS = new Set(["crosspost.preview", "rules.simulate", "creativeLibrary.validate", "creativeLibrary.planResize"]);
export const isReadOnly = (op: OperationMeta): boolean =>
  op.method === "GET" || op.tag === "analytics" || READ_ONLY_POSTS.has(op.id);

const RESERVED = ["body", "confirm", "idempotencyKey"];

function refs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) node.forEach((n) => refs(n, into));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") into.add(v.split("/").pop()!);
      else refs(v, into);
    }
  }
}

function defsFor(schemas: unknown[]): Record<string, unknown> | undefined {
  const need = new Set<string>();
  refs(schemas, need);
  const defs: Record<string, unknown> = {};
  for (const n of need) {
    const s = componentSchemas[n];
    if (!s) continue; // dangling ref in the spec: leave it open
    defs[n] = s;
    refs(s, need); // Set iteration visits entries added during the loop
  }
  return Object.keys(defs).length ? defs : undefined;
}

export const toolName = (op: OperationMeta) => `${op.tag}_${op.name}`;

export function buildTools(): ToolDef[] {
  return Object.values(operations).map((op) => {
    const readOnly = isReadOnly(op);
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of [...op.pathParams, ...op.query]) {
      if (RESERVED.includes(p.name)) throw new Error(`${op.id}: parameter "${p.name}" clashes with a reserved tool field`);
      props[p.name] = p.description ? { ...p.schema, description: p.description } : p.schema;
      if (p.required) required.push(p.name);
    }
    if (op.body) {
      props.body = op.body.schema;
      if (op.body.required) required.push("body");
    }
    if (!readOnly) {
      props.idempotencyKey = { type: "string", maxLength: 255, description: "Idempotency-Key; generated when omitted" };
      props.confirm = {
        type: "boolean",
        description: op.dryRun
          ? "Set true to execute for real. Without it this runs as a dry run (validate and preview only)."
          : "Set true to execute. Without it nothing is sent and a preview of the request is returned.",
      };
    }
    const defs = defsFor(Object.values(props));
    const note = readOnly
      ? ""
      : op.dryRun
        ? " WRITE: dry run by default; set confirm: true to execute."
        : " WRITE: not executed unless confirm: true (this operation has no server-side dry run).";
    return {
      name: toolName(op),
      title: op.summary,
      description: `${op.summary ?? op.id} (${op.method} ${op.path}).${note}`,
      inputSchema: { type: "object", properties: props, ...(required.length ? { required } : {}), ...(defs ? { $defs: defs } : {}) },
      annotations: {
        readOnlyHint: readOnly,
        ...(readOnly ? {} : { destructiveHint: op.method === "DELETE" || undefined, idempotentHint: op.method === "PUT" || op.method === "DELETE" || undefined }),
        openWorldHint: true,
      },
    };
  });
}

export interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
const text = (v: unknown, isError = false): ToolResult => ({
  content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const byName = new Map(Object.values(operations).map((op) => [toolName(op), op]));

export async function callTool(client: Advernue, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const op = byName.get(name);
  if (!op) return text(`Unknown tool "${name}"`, true);
  const readOnly = isReadOnly(op);
  const params: Record<string, unknown> = {};
  for (const p of [...op.pathParams, ...op.query]) if (args[p.name] !== undefined) params[p.name] = args[p.name];
  const body = args.body;
  const confirmed = args.confirm === true;

  // Writes are only sent for real with confirm: true.
  if (!readOnly && !confirmed && !op.dryRun) {
    return text({ executed: false, reason: "confirm: true is required; this operation has no dry run", request: { method: op.method, path: op.path, params, body } });
  }
  try {
    const result = await client.call(op.id, params, body, {
      dryRun: !readOnly && !confirmed,
      idempotencyKey: typeof args.idempotencyKey === "string" ? args.idempotencyKey : undefined,
    });
    if (result instanceof ArrayBuffer) return text(`[binary response, ${result.byteLength} bytes omitted]`);
    return text(result === undefined ? { ok: true } : result);
  } catch (e) {
    if (e instanceof AdvernueError) return text({ error: { status: e.status, code: e.code, message: e.message, details: e.details } }, true);
    return text((e as Error).message, true);
  }
}
