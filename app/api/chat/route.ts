// Design Ref: §2 데이터 흐름 — 화면에서 온 질문을 AI에게 전달하고 답을 돌려주는 서버 쪽 코드(주방)
// 이 파일은 서버에서만 실행되므로 API 키(OPENAI_API_KEY)가 화면 쪽으로 새지 않는다.
import OpenAI from "openai";
import { buildSystemPrompt } from "@/lib/prompt";

const MAX_QUESTION_LENGTH = 500; // 질문 최대 글자 수
const MAX_MESSAGES = 10; // 서버로 받을 최근 대화 개수
const TIMEOUT_MS = 10_000; // 10초 넘으면 고장으로 본다

type ChatMessage = { role: "user" | "assistant"; content: string };

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
    messages.push({ role, content });
  }

  // 마지막은 이용자의 질문이어야 하고, 비어 있거나 500자를 넘으면 안 된다.
  const last = messages[messages.length - 1];
  if (last.role !== "user") return null;
  const question = last.content.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) return null;

  return messages;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
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
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) return errorResponse(502);

    return Response.json({ answer });
  } catch {
    // 시간 초과·AI 서비스 오류 모두 같은 신호로 처리한다.
    return errorResponse(502);
  }
}
