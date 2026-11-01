#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./index.js";

if (!process.env.ADVERNUE_API_KEY) {
  console.error("advernue-mcp: ADVERNUE_API_KEY is not set; tool calls will fail until it is.");
}
await createServer().connect(new StdioServerTransport());
