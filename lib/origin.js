import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 원본 IP 포워딩 — 중계 구조에서는 원본 요청자의 IP 가 소실되므로, 요청별로 담아
 * da-api 행 fetch 에 전파한다(AsyncLocalStorage — await 체인 전파).
 */
export const originStore = new AsyncLocalStorage();

let installed = false;

export function installOriginForwarding() {
  if (installed) return;
  installed = true;

  const realFetch = globalThis.fetch;
  const base = process.env.DA_API_URL || "https://api.decision-anchor.com";
  const secret = process.env.MCP_ORIGIN_SECRET;

  globalThis.fetch = function (url, opts = {}) {
    try {
      const ctx = originStore.getStore();
      if (ctx && ctx.clientIp && secret && String(url).startsWith(base)) {
        opts = {
          ...opts,
          headers: {
            ...(opts.headers || {}),
            "X-DA-Origin-IP": ctx.clientIp,
            "X-DA-Origin-Secret": secret,
            // 채널 식별자(고정 enum, content-blind).
            "X-DA-Origin-Channel": "mcp",
          },
        };
      }
    } catch {
      // 헤더 주입 실패가 fetch 자체를 막지 않도록 swallow
    }
    return realFetch(url, opts);
  };
}
