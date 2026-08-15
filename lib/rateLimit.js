/**
 * lib/rateLimit.js — 공개 표면 유입 제어.
 *
 * 이 표면은 하루 수천 건을 받는다. 상한을 두어 폭주만 자르고 정상 사용은 그대로 통과시킨다.
 *
 * 상한은 보수적이다. 현 트래픽은 전체 하루 약 3,000건(≈ 분당 2건)이다.
 *   분당 60건/IP 는 그 **30배**이고, 단일 IP 가 전체 트래픽의 30배를 혼자 내는 상황이
 *   아니면 닿지 않는다. ⇒ 정상 사용을 막지 않으면서 폭주만 자른다.
 *   운영자 조정: 아래 상수 — 코드 한 줄이며 재시작으로 반영된다.
 *
 * ⚠설계 한계: in-process 카운터다. **프로세스가 하나**라는 전제 위에 서 있고, 수평 확장
 *   시에는 공유 카운터(Redis 등)로 올려야 한다.
 *
 * IP 신뢰 근거: 키는 `cf-connecting-ip` 다. 이 호스트는 Cloudflare 를 경유하고 CF 가 이
 *   헤더를 자신이 덮어쓰므로, 클라이언트가 위조해 매 요청 새 버킷을 받는 경로가 없다.
 */

// 운영자 조정 지점 — 현 전체 트래픽(≈분당 2건)의 30배.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;

// key -> { count, windowStart }
const buckets = new Map();

// 창이 지난 버킷 정리 — Map 이 무한히 자라지 않게. 창 길이의 10배마다 훑는다.
let lastSweep = Date.now();
function sweep(now) {
  if (now - lastSweep < WINDOW_MS * 10) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.windowStart >= WINDOW_MS) buckets.delete(k);
  }
}

/**
 * @returns {{allowed: boolean, remaining: number, retryAfterSec: number}}
 * 부작용: 허용 시 카운터를 올린다. 거부 시에는 올리지 않는다(거부가 창을 연장하지 않게).
 */
function check(key, now = Date.now()) {
  sweep(now);
  const k = key || 'unknown';
  let b = buckets.get(k);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(k, b);
  }
  if (b.count >= MAX_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((b.windowStart + WINDOW_MS - now) / 1000)),
    };
  }
  b.count += 1;
  return { allowed: true, remaining: MAX_PER_WINDOW - b.count, retryAfterSec: 0 };
}

/** 테스트·운용 점검용 — 카운터 비우기. */
function reset() { buckets.clear(); }

export { check, reset, WINDOW_MS, MAX_PER_WINDOW };
