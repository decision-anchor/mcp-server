import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 원본 IP 포워딩 — 중계 구조에서는 원본 요청자의 IP 가 소실되므로, 요청별로 담아
 * da-api 행 fetch 에 전파한다(AsyncLocalStorage — await 체인 전파).
 */
export const originStore = new AsyncLocalStorage();

// stdio 전용 토큰 폴백. index.js 가 stdio 모드에서만 채운다. --http 모드는
//   DA_AUTH_TOKEN 이 설정돼 있으면 기동을 거부하므로(익명 호출 전부가 한 신원을 공유하게 된다)
//   여기 값이 원격 서버에서 채워질 길이 없다.
let envFallbackToken = null;
export function setEnvFallbackToken(token) { envFallbackToken = token || null; }
export function getEnvFallbackToken() { return envFallbackToken; }

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
            // 앞단이 붙인 국가 코드(ISO 3166-1 alpha-2). 이 fetch 는 새 요청이라
            // 원래 헤더가 소실되므로 함께 넘긴다. 없으면 키를 만들지 않는다.
            ...(ctx.clientCountry ? { "X-DA-Origin-Country": ctx.clientCountry } : {}),
          },
        };
      }
    } catch {
      // 헤더 주입 실패가 fetch 자체를 막지 않도록 swallow
    }
    return realFetch(url, opts);
  };
}
