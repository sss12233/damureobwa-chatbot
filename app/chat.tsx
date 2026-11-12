"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = {
  role: "user" | "bot";
  text: string;
  // 고장 안내 말풍선은 AI에게 보내는 대화 기록에서 뺀다.
  isError?: boolean;
};

const MAX_QUESTION_LENGTH = 500; // 서버와 같은 질문 최대 글자 수
const MAX_HISTORY = 10; // 서버와 같은 최근 대화 개수
const REQUEST_TIMEOUT_MS = 10_000; // 10초 넘으면 고장으로 본다

// 개발 단위 10: AI가 고장 나거나 답을 못 만들 때 보여 주는 문구 (PRD 화면 규칙, 화면에만 둔다)
const ERROR_MESSAGE =
  "지금은 답변이 어려워요. 041-530-9078로 문의해 주세요.";

// 개발 단위 12: 추천 질문 4개 (PRD와 같은 문구. 누르면 이 글이 그대로 질문으로 보내진다)
const SUGGESTIONS = [
  "숙식 무료인가요?",
  "대기자 등록 방법",
  "전날 숙박 가능?",
  "수료증 발급",
];

// 중요 키워드: 화면 아래에 항상 보이고, 누르거나 입력 칸에 비슷한 말을 쓰면 관련 질문이 뜬다.
// 질문은 모두 data/guide.md에 답이 있는 것만 둔다. (guide.md를 고치면 여기도 함께 고친다)
const KEYWORDS: { label: string; match: string[]; questions: string[] }[] = [
  {
    label: "숙소",
    match: ["숙소", "숙박", "비품", "객실"],
    questions: [
      "숙소에 뭐가 있어요?",
      "숙소 입실 시간은?",
      "숙소 키를 잃어버렸어요",
      "교육 전날 숙박 가능?",
    ],
  },
  {
    label: "주차",
    match: ["주차", "택시", "오시는", "교통"],
    questions: ["주차할 수 있나요?", "택시는 어떻게 부르나요?", "오시는 길 알려 주세요"],
  },
  {
    label: "수료증",
    match: ["수료"],
    questions: ["수료증 발급 방법", "수료 조건이 뭐예요?"],
  },
  {
    label: "식당",
    match: ["식당", "매점", "식사"],
    questions: ["식당 이용 규칙", "식사 시간은?", "매점 전화번호"],
  },
  {
    label: "신청",
    match: ["신청"],
    questions: [
      "교육 신청 방법",
      "신청 결과는 어디서 확인해요?",
      "전화로 교육 신청할 수 있나요?",
    ],
  },
  {
    label: "교육비",
    match: ["교육비", "비용", "무료"],
    questions: ["교육비는 얼마예요?", "숙식 무료인가요?"],
  },
  {
    label: "연락처",
    match: ["연락", "전화", "문의"],
    questions: ["담당 부서 전화번호", "홈페이지 이용 문의는 어디로 하나요?"],
  },
];

const GREETING: Message = {
  role: "bot",
  text: "안녕하세요! 다물어봐 챗봇입니다. 교육 신청, 숙소, 수료증 등 궁금한 점을 물어보세요.",
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLLIElement>(null);
  // 대화 초기화를 누르면 1씩 올려서, 초기화 전에 보낸 질문의 늦은 답이 새 대화에 끼지 않게 한다.
  const sessionRef = useRef(0);
  // 눌러서 펼친 키워드 (없으면 null)
  const [openKeyword, setOpenKeyword] = useState<string | null>(null);

  // 입력한 글에 키워드가 들어 있으면 그 키워드를, 아니면 눌러서 펼친 키워드를 보여 준다.
  const typedKeyword = KEYWORDS.find((k) =>
    k.match.some((word) => input.includes(word)),
  );
  const related = typedKeyword ?? KEYWORDS.find((k) => k.label === openKeyword);

  // 이어서 물어볼 질문: 챗봇이 답한 직후, 방금 질문과 같은 주제의 다른 질문을 최대 2개 보여 준다.
  const lastMessage = messages[messages.length - 1];
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text;
  const followUps =
    !loading && lastMessage.role === "bot" && !lastMessage.isError && lastUserText
      ? (KEYWORDS.find(
          (k) =>
            k.questions.includes(lastUserText) ||
            k.match.some((word) => lastUserText.includes(word)),
        )
          ?.questions.filter(
            (q) => !q.includes(lastUserText) && !lastUserText.includes(q),
          )
          .slice(0, 2) ?? [])
      : [];

  // 새 말이 생기면 대화 칸을 맨 아래로 내린다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 대화 초기화: 첫 인사말 상태로 되돌리고 키워드·입력 칸도 비운다.
  function resetChat() {
    sessionRef.current += 1;
    setMessages([GREETING]);
    setInput("");
    setOpenKeyword(null);
    setLoading(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(input);
  }

  // 질문을 보내고 답을 받아 대화 칸에 보여 준다. (입력 칸과 추천 질문 버튼이 함께 쓴다)
  async function sendQuestion(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    const session = sessionRef.current;
    const next: Message[] = [...messages, { role: "user", text: question }];
    setMessages(next);
    setInput("");
    setOpenKeyword(null);
    setLoading(true);

    // 서버로 보낼 대화: 인사말·고장 안내는 빼고, 최근 10개만. 화면의 "bot"은 "assistant"로 바꿔 보낸다.
    const history = next
      .slice(1)
      .filter((m) => !m.isError)
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("서버 오류");
      const data: { answer?: string } = await response.json();
      if (!data.answer) throw new Error("빈 답");

      if (session !== sessionRef.current) return;
      setMessages((prev) => [...prev, { role: "bot", text: data.answer! }]);
    } catch {
      if (session !== sessionRef.current) return;
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: ERROR_MESSAGE, isError: true },
      ]);
    } finally {
      if (session === sessionRef.current) setLoading(false);
    }
  }

  return (
    <div className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/30 bg-black/30 text-white shadow-2xl backdrop-blur-md">
      <header className="flex items-center justify-between gap-3 border-b border-white/20 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[3px] text-white/80">공무원 직무전문교육</p>
          <h1 className="font-display text-2xl font-medium">다물어봐 챗봇</h1>
        </div>
        <button
          type="button"
          onClick={resetChat}
          className="shrink-0 rounded-full border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          🔄 대화 초기화
        </button>
      </header>

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.map((message, index) => (
          <li
            key={index}
            className={
              message.role === "user"
                ? "max-w-[80%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#f87b97] px-4 py-2 text-white"
                : "max-w-[80%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/90 px-4 py-2 text-zinc-900"
            }
          >
            {message.text}
          </li>
        ))}
        {loading && (
          <li className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-white/80 px-4 py-2 text-zinc-600">
            답변 작성 중…
          </li>
        )}
        {followUps.length > 0 && (
          <li className="flex flex-wrap items-center gap-2 self-start">
            <span className="text-xs text-white/70">이어서 물어보기</span>
            {followUps.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => void sendQuestion(question)}
                className="rounded-full border border-white/50 px-3 py-1 text-sm text-white hover:bg-white/20"
              >
                {question}
              </button>
            ))}
          </li>
        )}
        <li ref={bottomRef} aria-hidden="true" />
      </ul>

      {/* 개발 단위 12 (nice): 추천 질문 버튼. 대화가 시작되면 숨긴다. */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={loading}
              onClick={() => void sendQuestion(suggestion)}
              className="rounded-full border border-white/50 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* 관련 질문: 키워드를 누르거나 입력 칸에 키워드를 쓰면 뜬다. 누르면 그 질문이 바로 전송된다. */}
      {related && (
        <div
          aria-label={`${related.label} 관련 질문`}
          className="flex flex-col gap-2 border-t border-white/20 px-5 py-2"
        >
          <p className="text-xs text-white/70">{related.label} 관련 질문</p>
          <div className="flex flex-wrap gap-2">
            {related.questions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={loading}
                onClick={() => void sendQuestion(question)}
                className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/25 disabled:opacity-40"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 중요 키워드: 항상 보인다. 누르면 관련 질문이 펼쳐지고, 다시 누르면 접힌다. */}
      <div className="flex flex-wrap gap-2 border-t border-white/20 px-5 py-2">
        <span className="self-center text-xs text-white/70">
          중요 키워드
        </span>
        {KEYWORDS.map((keyword) => {
          const active = related?.label === keyword.label;
          return (
            <button
              key={keyword.label}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setOpenKeyword(active && !typedKeyword ? null : keyword.label)
              }
              className={
                active
                  ? "shrink-0 rounded-full bg-[#f87b97] px-3 py-1 text-sm text-white"
                  : "shrink-0 rounded-full border border-white/40 px-3 py-1 text-sm text-white hover:bg-white/15"
              }
            >
              {keyword.label}
            </button>
          );
        })}
      </div>

      {/* 개발 단위 4: 개인정보 안내 문구를 항상 보여 준다. */}
      <p
        role="note"
        className="border-t border-white/20 bg-white/10 px-5 py-2 text-xs text-white/90"
      >
        ⚠️ 이름, 전화번호, 주민등록번호 등 개인정보는 입력하지 마세요. 질문은 답변을 만들기 위해 OpenAI(해외 AI 서비스)로 전달됩니다.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-white/20 p-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="궁금한 점을 입력하세요"
          aria-label="질문 입력"
          maxLength={MAX_QUESTION_LENGTH}
          className="flex-1 rounded-full border border-white/40 bg-white/10 px-5 py-2 text-white outline-none placeholder:text-white/60 focus:border-[#f87b97]"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-full bg-[#f87b97] px-6 py-2 font-medium text-white disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
