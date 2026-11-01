import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Advernue, operations } from "@advernue/sdk";
import { createServer } from "../src/index.js";

async function setup(respond: () => Response = () => new Response("{}", { headers: { "content-type": "application/json" } })) {
  const calls: Array<{ url: string; init: any }> = [];
  const fetchFake = (async (url: string, init: any) => { calls.push({ url, init }); return respond(); }) as unknown as typeof fetch;
  const server = createServer(new Advernue({ apiKey: "k", baseUrl: "https://example.test", fetch: fetchFake }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return { client, calls };
}
const json = (b: unknown, status = 200) => () => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const textOf = (r: any) => JSON.parse(r.content[0].text);

describe("tool listing", () => {
  it("exposes one tool per operation, named <tag>_<operation>, with JSON-schema input", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(Object.keys(operations).length);
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(tools.length);
    expect(names.has("campaigns_list")).toBe(true);
    expect(names.has("analytics_compare")).toBe(true);
    expect(tools.every((t) => t.name.length <= 64 && /^[A-Za-z0-9_-]+$/.test(t.name))).toBe(true);
    const create = tools.find((t) => t.name === "campaigns_create")!;
    expect(create.inputSchema.required).toContain("body");
    expect((create.inputSchema as any).$defs.Budget).toBeDefined(); // refs resolve inside the tool
    expect((create.inputSchema.properties as any).confirm.type).toBe("boolean");
  });

  it("annotates reads as readOnly and writes as not", async () => {
    const { client } = await setup();
    const t = Object.fromEntries((await client.listTools()).tools.map((x) => [x.name, x]));
    expect(t.campaigns_list.annotations?.readOnlyHint).toBe(true);
    expect(t.analytics_compare.annotations?.readOnlyHint).toBe(true); // read-only POST
    expect(t.campaigns_create.annotations?.readOnlyHint).toBe(false);
    expect(t.campaigns_create.annotations?.destructiveHint).toBeUndefined();
    expect(t.notes_delete.annotations?.destructiveHint).toBe(true);
    expect((t.campaigns_list.inputSchema.properties as any).confirm).toBeUndefined();
  });
});

describe("calling tools", () => {
  it("runs reads directly", async () => {
    const { client, calls } = await setup(json([{ id: "c1" }]));
    const r = await client.callTool({ name: "campaigns_list", arguments: { status: "paused" } });
    expect(textOf(r)).toEqual([{ id: "c1" }]);
    expect(calls[0].url).toBe("https://example.test/v1/campaigns?status=paused");
    expect(calls[0].init.headers.authorization).toBe("Bearer k");
  });

  it("defaults writes to dry run unless confirm: true", async () => {
    const { client, calls } = await setup(json({ status: "dry_run" }));
    const body = { adAccountId: "a", name: "n", objective: "traffic" };
    await client.callTool({ name: "campaigns_create", arguments: { body } });
    expect(calls[0].url).toBe("https://example.test/v1/campaigns?dry_run=true");
    await client.callTool({ name: "campaigns_create", arguments: { body, confirm: false } });
    expect(calls[1].url).toContain("dry_run=true");
    await client.callTool({ name: "campaigns_create", arguments: { body, confirm: true, idempotencyKey: "k1" } });
    expect(calls[2].url).toBe("https://example.test/v1/campaigns");
    expect(calls[2].init.headers["idempotency-key"]).toBe("k1");
    expect(JSON.parse(calls[2].init.body)).toEqual(body);
  });

  it("does not send writes that have no server dry run until confirmed", async () => {
    const { client, calls } = await setup(json({}));
    const r = await client.callTool({ name: "notes_delete", arguments: { id: "n1" } });
    expect(calls).toHaveLength(0);
    expect(textOf(r).executed).toBe(false);
    await client.callTool({ name: "notes_delete", arguments: { id: "n1", confirm: true } });
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe("https://example.test/v1/notes/n1");
  });

  it("returns API errors as isError results", async () => {
    const { client } = await setup(json({ error: { code: "forbidden", message: "nope" } }, 403));
    const r: any = await client.callTool({ name: "campaigns_list", arguments: {} });
    expect(r.isError).toBe(true);
    expect(textOf(r).error).toMatchObject({ status: 403, code: "forbidden" });
    const u: any = await client.callTool({ name: "nope_nope", arguments: {} });
    expect(u.isError).toBe(true);
  });
});
