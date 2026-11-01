import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Advernue } from "@advernue/sdk";
import { buildTools, callTool } from "./tools.js";

export { buildTools, callTool, isReadOnly, toolName } from "./tools.js";

export function createServer(client: Advernue = new Advernue(), version = "0.1.0"): Server {
  const tools = buildTools();
  const server = new Server({ name: "advernue", version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => callTool(client, req.params.name, req.params.arguments));
  return server;
}
