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

const GREETING: Message = {
  role: "bot",
  text: "안녕하세요! 다물어봐 챗봇입니다. 교육 신청, 숙소, 수료증 등 궁금한 점을 물어보세요.",
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLLIElement>(null);

  // 새 말이 생기면 대화 칸을 맨 아래로 내린다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(input);
  }

  // 질문을 보내고 답을 받아 대화 칸에 보여 준다. (입력 칸과 추천 질문 버튼이 함께 쓴다)
  async function sendQuestion(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    const next: Message[] = [...messages, { role: "user", text: question }];
    setMessages(next);
    setInput("");
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

      setMessages((prev) => [...prev, { role: "bot", text: data.answer! }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: ERROR_MESSAGE, isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">공무원 직무전문교육</p>
        <h1 className="text-lg font-semibold">다물어봐 챗봇</h1>
      </header>

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.map((message, index) => (
          <li
            key={index}
            className={
              message.role === "user"
                ? "max-w-[80%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-white"
                : "max-w-[80%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }
          >
            {message.text}
          </li>
        ))}
        {loading && (
          <li className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-zinc-500 dark:bg-zinc-800">
            답변 작성 중…
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
              className="rounded-full border border-blue-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-40 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* 개발 단위 4: 개인정보 안내 문구를 항상 보여 준다. */}
      <p
        role="note"
        className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        ⚠️ 이름, 전화번호, 주민등록번호 등 개인정보는 입력하지 마세요.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="궁금한 점을 입력하세요"
          aria-label="질문 입력"
          maxLength={MAX_QUESTION_LENGTH}
          className="flex-1 rounded-xl border border-zinc-300 bg-transparent px-4 py-2 outline-none focus:border-blue-600 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-xl bg-blue-600 px-5 py-2 font-medium text-white disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
