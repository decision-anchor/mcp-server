import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

export function registerTslTools(server) {
  server.tool(
    "list_tools",
    "Browse the agent-to-agent tool marketplace. Discover tools that other agents have built and published.",
    {
      layer: z.enum(["layer1", "layer2"]).optional().describe("Filter by layer"),
      status: z.enum(["active", "suspended", "deprecated", "defunct"]).optional().describe("Filter by status"),
      limit: z.number().optional().describe("Max results"),
      page: z.number().optional().describe("Page number"),
    },
    async ({ layer, status, limit, page }) => {
      const { res, data } = await daFetch("/v1/tsl/tools", { query: { layer, status, limit, page } });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "register_tool",
    "Publish a tool you built to the marketplace. Set a price in DAC and earn revenue when other agents purchase it.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      tool_name: z.string().describe("Tool name (no personal identifying information)"),
      tool_description: z.string().optional().describe("What the tool does (no personal identifying information)"),
      layer: z.enum(["layer1", "layer2"]).default("layer1").describe("layer1 = standalone, layer2 = component"),
      price_dac: z.number().describe("Price in DAC (must be > 0)"),
      ara_connections: z.array(z.object({
        observation_type: z.string().describe("e.g. agent_profile, agent_timeline, agent_ee_pattern"),
        resolution_level: z.number().optional().describe("1-3 depending on type (default 1)"),
      })).describe("Required — at least one ARA observation connection this tool interprets"),
    },
    async ({ auth_token, ...body }) => {
      const { res, data } = await daFetch("/v1/tsl/tool/register", {
        method: "POST", authToken: auth_token, body,
      });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "purchase_tool",
    "Purchase a tool from the marketplace. The tool creator earns DAC from your purchase. Paid via x402 — Trial does not cover this route.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      tool_id: z.string().describe("Tool ID to purchase"),
      request_id: z.string().optional().describe("Optional idempotency key — must be a UUID (the server rejects non-UUID values). Auto-generated if omitted."),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, tool_id, request_id, payment_signature }) => {
      // 서버는 snake_case tool_id·request_id 를 요구한다(없으면 400 INVALID_INPUT).
      // camelCase toolId·requestId 는 서버가 읽지 않아, x402
      // 게이트를 통과시켜도 곧바로 400 이 되는 이중 차단이었다. 402 챌린지의 bazaar input
      // 스키마도 tool_id 를 정본으로 광고한다.
      // 유료 경로에는 멱등 키를 항상 실어 보낸다 — dd.js 와 같은 규칙. 서버는 이 라우트에서
      //   request_id 를 선택으로 받으므로, 생략하면 그 호출은 멱등이 아니게 된다. 호출자가
      //   직접 키를 주면 그것을 쓰고, 안 주면 여기서 만든다.
      // ※이 파일은 공개 사본(decision-anchor/mcp-server)으로 그대로 복사된다 —
      //   변경 경위·내부 구현 서술은 여기 적지 않는다(공개 표면 규율).
      const body = { tool_id, request_id: request_id || crypto.randomUUID() };

      const { res, data, paymentResponse } = await daFetch("/v1/tsl/purchase", {
        method: "POST", authToken: auth_token, paymentSignature: payment_signature, body,
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );
}
