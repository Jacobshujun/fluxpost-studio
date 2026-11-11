import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { appConfig } from "./config";

export async function searchMagpieWeb(query: string): Promise<string> {
  const apiKey = appConfig.magpieGatewayKey;
  if (!apiKey) throw new Error("请先在高级配置中填写 Magpie API Key，再启用联网搜索。");
  if (!query.trim()) throw new Error("联网搜索关键词不能为空。");

  const client = new Client({ name: "fluxpost-studio", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(appConfig.magpieWebSearchUrl), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error" },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
  });
  try {
    await client.connect(transport, { timeout: 30_000 });
    const result = CallToolResultSchema.parse(await client.callTool({ name: "web_search", arguments: { query: query.trim(), count: 5 } }, CallToolResultSchema, { timeout: 300_000 }));
    if (result.isError) throw new MagpieSearchError("Magpie 搜索工具返回失败，请检查网关服务后重试。");
    const text = result.content.flatMap((item) => item.type === "text" ? [item.text.trim()] : []).filter(Boolean).join("\n\n");
    if (!text) throw new MagpieSearchError("Magpie 未返回可用的搜索文本，请调整关键词后重试。");
    return text;
  } catch (error) {
    if (error instanceof MagpieSearchError) throw error;
    if (error instanceof StreamableHTTPError && error.code && error.code > 0) {
      throw new Error(`Magpie 联网搜索请求失败（HTTP ${error.code}），请检查密钥和网关服务。`);
    }
    if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
      throw new Error("Magpie 联网搜索超时，请检查服务连接后重试。");
    }
    throw new Error("Magpie 联网搜索连接或协议失败，请检查搜索地址、密钥及本机网络。");
  } finally {
    await client.close();
  }
}

class MagpieSearchError extends Error {}
