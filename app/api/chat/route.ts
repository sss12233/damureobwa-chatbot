// Design Ref: §2 데이터 흐름 — 화면에서 온 질문을 AI에게 전달하고 답을 돌려주는 서버 쪽 코드(주방)
// 이 파일은 서버에서만 실행되므로 API 키(OPENAI_API_KEY)가 화면 쪽으로 새지 않는다.
import OpenAI from "openai";
import { buildSystemPrompt } from "@/lib/prompt";

const MAX_QUESTION_LENGTH = 500; // 질문 최대 글자 수
const MAX_MESSAGES = 10; // 서버로 받을 최근 대화 개수
const TIMEOUT_MS = 10_000; // 10초 넘으면 고장으로 본다

// 남용 방지(비용 보호): 한 사람이 너무 자주·너무 크게 보내지 못하게 막는다.
const MAX_BODY_LENGTH = 20_000; // 받는 데이터 전체 최대 글자 수
const MAX_MESSAGE_LENGTH = 2_000; // 대화 한 개(질문·답)의 최대 글자 수
const MAX_TOTAL_LENGTH = 8_000; // 대화 10개를 합친 최대 글자 수
const MAX_ANSWER_TOKENS = 500; // AI 답변 최대 길이(토큰)
const RATE_LIMIT_COUNT = 20; // 1분에 보낼 수 있는 질문 수
const RATE_LIMIT_WINDOW_MS = 60_000;

type ChatMessage = { role: "user" | "assistant"; content: string };

// 접속자별 최근 요청 시각을 메모리에 잠깐 기억한다. (저장소 없음. 서버가 꺼지면 사라짐)
const recentRequests = new Map<string, number[]>();

// 1분 안에 20번을 넘기면 true. (서버가 여러 대로 나뉘면 완벽하진 않지만 PoC에는 충분)
function isRateLimited(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const times = (recentRequests.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  times.push(now);
  recentRequests.set(ip, times);

  // 기억이 끝없이 커지지 않게 오래된 접속자는 지운다.
  if (recentRequests.size > 1000) {
    for (const [key, value] of recentRequests) {
      if (now - value[value.length - 1] >= RATE_LIMIT_WINDOW_MS) {
        recentRequests.delete(key);
      }
    }
  }
  return times.length > RATE_LIMIT_COUNT;
}

// 오류는 신호만 보낸다. 고장 안내 문구는 화면이 보여 준다. (질문·답 내용은 기록에 남기지 않는다)
function errorResponse(status: number) {
  return Response.json({ error: true }, { status });
}

// 받은 데이터가 올바른 대화 모양인지 검사한다.
function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const messages: ChatMessage[] = [];
  for (const item of raw.slice(-MAX_MESSAGES)) {
    if (typeof item !== "object" || item === null) return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    if (content.length > MAX_MESSAGE_LENGTH) return null;
    messages.push({ role, content });
  }
  if (messages.reduce((sum, m) => sum + m.content.length, 0) > MAX_TOTAL_LENGTH) {
    return null;
  }

  // 마지막은 이용자의 질문이어야 하고, 비어 있거나 500자를 넘으면 안 된다.
  const last = messages[messages.length - 1];
  if (last.role !== "user") return null;
  const question = last.content.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) return null;

  // 앞쪽 질문도 500자 제한을 똑같이 적용한다.
  if (messages.some((m) => m.role === "user" && m.content.length > MAX_QUESTION_LENGTH)) {
    return null;
  }

  // 챗봇이 한 말(assistant)도 함께 넘긴다. 빼면 AI가 "답 없이 쌓인 이전 질문"에도
  // 다시 답해서 이전 답변이 새 답변에 붙어 나오기 때문이다. (길이 제한은 위에서 이미 적용됨)
  return messages;
}

// 보안: 우리 화면(같은 사이트)에서 보낸 JSON 요청만 받는다.
// 다른 사이트가 방문자 브라우저로 몰래 부르는 것을 막는다.
function isTrustedRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return false;
  // 브라우저는 이 헤더를 스스로 붙인다. 없으면(서버끼리 호출 등) 통과시킨다.
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

export async function POST(request: Request) {
  if (!isTrustedRequest(request)) return errorResponse(403);
  if (isRateLimited(request)) {
    // 남용을 알아챌 수 있게 사실만 남긴다. (질문·답 내용은 남기지 않는다)
    console.warn("[chat] 요청 횟수 제한에 걸림");
    return errorResponse(429);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return errorResponse(400);
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400);
  }

  const messages = parseMessages(body);
  if (!messages) return errorResponse(400);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errorResponse(500);

  try {
    const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
      // 비용 보호: 답이 아주 길어지지 않게 상한을 둔다. (5문장 답에는 충분하다)
      max_completion_tokens: MAX_ANSWER_TOKENS,
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) return errorResponse(502);

    return Response.json({ answer });
  } catch {
    // 시간 초과·AI 서비스 오류 모두 같은 신호로 처리한다.
    return errorResponse(502);
  }
}
