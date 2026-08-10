// mcp/lib/daFetch.js
// da-api 호출 단일 통로. 도구마다 흩어져 있던 fetch(헤더 조립 + 본문 직렬화 + 응답 파싱)를
// 여기로 모은다.
//
// 왜 모으는가: 송신 필드명이 서버 수신 계약과 어긋나는 드리프트는 호출부가 도구마다
//   인라인일 때 생긴다 — 계약이 한눈에 보이지 않기 때문이다. 경로·본문·헤더를 한 함수로
//   좁혀 두면 대조 지점이 하나가 된다.
//
// 경계: 이 모듈은 da-api 의 공개 HTTP 라우트만 부른다. 코어 DB 무접촉 — 얇은 어댑터라는
//   da-mcp 의 성격은 그대로다. 서명·지갑·키를 절대 다루지 않는다(아래 paymentSignature 주석).

const daApiBase = () => process.env.DA_API_URL || "https://api.decision-anchor.com";

/**
 * da-api 호출 1건.
 *
 * @param {string} path                   `/v1/...` (쿼리는 query 로 넘긴다)
 * @param {object}  [opts]
 * @param {string}  [opts.method]         기본 GET
 * @param {string}  [opts.authToken]      Bearer 토큰
 * @param {string}  [opts.paymentSignature] x402 결제 payload(base64). 호출자가 자기 지갑으로
 *        서명해 건네주는 불투명 문자열이다. 어댑터는 **서명하지 않고 전달만 한다** — 키를 쥐면
 *        DA 가 호출자 자금을 수탁하게 된다. 서버는 Payment-Signature(정본) 또는 X-Payment
 *        (레거시)를 읽는다(@x402/express). 정본만 보낸다.
 * @param {object}  [opts.body]           JSON 본문(GET 이면 무시)
 * @param {object}  [opts.query]          쿼리 파라미터. undefined·null·"" 값은 제외.
 * @returns {Promise<{res: Response, data: any, paymentResponse: string|null}>}
 *
 * ★미지정 파라미터는 헤더를 아예 만들지 않는다. paymentSignature 가 없으면 요청 바이트가
 *   종전과 동일하므로 무료/trial 경로의 게이트 판정(trial bypass 등)이 그대로 유지된다.
 */
export async function daFetch(path, opts = {}) {
  const { method = "GET", authToken, paymentSignature, body, query } = opts;

  let url = `${daApiBase()}${path}`;
  if (query) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    }
    const qs = p.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (paymentSignature) headers["Payment-Signature"] = paymentSignature;

  const init = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  // 본문 파싱은 방어적으로 — 게이트가 빈 본문이나 비 JSON(프록시 오류 페이지 등)을 돌려줄 때
  // 도구가 throw 하면 호출자에게는 원인 불명 에러만 남는다. 상태코드는 살려서 넘긴다.
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  // x402 정산 영수증. settle 은 res.end 이후라 tx 자체는 아니지만, 결제가 실제로 돌았다는
  // 유일한 호출자 측 증거다. 지금까지는 body 만 반환해 이 헤더가 버려졌다.
  const paymentResponse =
    res.headers.get("payment-response") || res.headers.get("x-payment-response") || null;

  return { res, data, paymentResponse };
}

/** 유료 도구의 공통 선택 입력. zod 스키마에 스프레드해서 쓴다. */
export const PAYMENT_SIGNATURE_DESCRIPTION =
  "Optional x402 payment payload (base64), required only for paid calls. Omit it on the " +
  "first call: the tool returns the payment challenge. Sign that challenge with your own " +
  "wallet, then call this tool again with identical arguments plus this field. Decision " +
  "Anchor never holds your key and never signs on your behalf.";
