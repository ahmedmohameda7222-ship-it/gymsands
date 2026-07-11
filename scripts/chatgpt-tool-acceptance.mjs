const base = process.env.PLAIVRA_DEPLOYMENT_URL;
const token = process.env.PLAIVRA_MCP_ACCESS_TOKEN;
if (!base || !token) throw new Error("Set PLAIVRA_DEPLOYMENT_URL and PLAIVRA_MCP_ACCESS_TOKEN.");
const endpoint = new URL("/api/mcp", base);
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const listResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
if (!listResponse.ok) throw new Error(`tools/list HTTP ${listResponse.status}`);
const listed = await listResponse.json();
const tools = listed?.result?.tools;
if (!Array.isArray(tools) || tools.length !== 35) throw new Error(`Expected 35 tools, received ${Array.isArray(tools) ? tools.length : "invalid"}.`);
for (const tool of tools) {
  if (!tool.inputSchema || !tool.outputSchema || !Array.isArray(tool.securitySchemes)) throw new Error(`Incomplete contract: ${tool.name}`);
}
const statusResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_plaivra_status", arguments: {} } }) });
if (!statusResponse.ok) throw new Error(`status tool HTTP ${statusResponse.status}`);
const status = await statusResponse.json();
if (status?.result?.isError || status?.result?.structuredContent?.ok !== true) throw new Error("get_plaivra_status failed.");
console.log(JSON.stringify({ acceptedAt: new Date().toISOString(), publicToolCount: tools.length, status: "passed" }, null, 2));
