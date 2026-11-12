"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CATEGORIES, splitFollowUps } from "@/lib/faq";

type Message = {
  role: "user" | "bot";
  text: string;
  // 고장 안내 말풍선은 AI에게 보내는 대화 기록에서 뺀다.
  isError?: boolean;
  // 고장 났을 때 "다시 시도"로 되보낼 질문
  retryQuestion?: string;
  // 챗봇이 이 답변 끝에 골라 준 '이어서 물어볼 질문'
  followUps?: string[];
};

const MAX_QUESTION_LENGTH = 500; // 서버와 같은 질문 최대 글자 수
const MAX_HISTORY = 10; // 서버와 같은 최근 대화 개수
const REQUEST_TIMEOUT_MS = 15_000; // 15초 넘으면 고장으로 본다 (답이 조금 길어져 10초에서 늘림)

// 개발 단위 10: AI가 고장 나거나 답을 못 만들 때 보여 주는 문구 (PRD 화면 규칙, 화면에만 둔다)
const ERROR_MESSAGE =
  "답변을 가져오지 못했어요. 아래 [다시 시도]를 눌러 주세요. 계속 안 되면 041-530-9078로 문의해 주세요.";

// 답변 속 전화번호(041-530-9078)와 웹주소(https://…)를 눌러 쓸 수 있는 링크로 바꾼다.
const LINK_PATTERN = /(https?:\/\/[^\s)]+|0\d{1,2}-\d{3,4}-\d{4})/g;
function renderWithLinks(text: string) {
  return text.split(LINK_PATTERN).map((part, index) => {
    if (index % 2 === 0) return part; // 일반 글자
    const isUrl = part.startsWith("http");
    return (
      <a
        key={index}
        href={isUrl ? part : `tel:${part.replaceAll("-", "")}`}
        {...(isUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="whitespace-nowrap font-medium text-blue-700 underline underline-offset-2"
      >
        {part}
      </a>
    );
  });
}

// 길 안내: 이동 방법·거리·위치를 물으면 답 아래에 네이버 지도 링크를 띄운다.
// 주소는 data/guide.md의 '오시는 길'과 같다. (주소가 바뀌면 여기도 함께 고친다)
const MAP_PLACE = "충청남도 아산시 도고면 온천대로 605-15"; // 캠코인재개발원 주소 (주소로 찾아야 가장 정확하다)
const NAVER_MAP_URL = `https://map.naver.com/p/search/${encodeURIComponent(MAP_PLACE)}`;
// 캠코 공공교육 홈페이지의 [교육소개] → [찾아오시는 길] 페이지
const HOMEPAGE_DIRECTIONS_URL =
  "https://public-edu.kamco.or.kr/service/intro/intro4_pg.do?mid=406";
const DIRECTION_WORDS = [
  "오시는", "가는 법", "가는법", "가는 길", "가는길", "길찾", "길 알려", "찾아가",
  "교통", "거리", "걸리", "소요", "이동", "위치", "주소", "어디에 있",
  "버스", "기차", "지하철", "전철", "KTX", "SRT", "택시", "역에서",
];

const GREETING: Message = {
  role: "bot",
  text: "안녕하세요! 다물어봐 챗봇입니다. 교육 신청부터 오시는 길, 숙소, 식사, 수료증까지 궁금한 점을 물어보세요. 아래 분류를 눌러도 됩니다.",
};

// 대화 전체를 글로 만든다 (복사용). 첫 인사말은 뺀다.
function conversationToText(messages: Message[]): string {
  return messages
    .slice(1)
    .filter((m) => !m.isError)
    .map((m) => `${m.role === "user" ? "[질문]" : "[답변]"} ${m.text}`)
    .join("\n\n");
}

// 클립보드에 글을 복사한다. 지원하지 않는 브라우저에서는 임시 입력칸으로 대신한다.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

const CHAT_STORAGE_KEY = "damulbwa-chat"; // 대화를 이 창에 저장할 때 쓰는 이름

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLLIElement>(null);
  // 대화 초기화를 누르면 1씩 올려서, 초기화 전에 보낸 질문의 늦은 답이 새 대화에 끼지 않게 한다.
  const sessionRef = useRef(0);
  // 눌러서 펼친 분류 (없으면 null)
  const [openKeyword, setOpenKeyword] = useState<string | null>(null);
  // 대화 초기화 확인 중인지 / 방금 복사했는지
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  const firstScreen = messages.length === 1; // 아직 대화를 시작하지 않은 첫 화면

  // 가장 마지막에 한 행동을 따른다: 분류 버튼을 눌렀으면 그 분류를,
  // 그 뒤에 입력 칸에 글을 쓰면(쓸 때 누른 분류가 풀린다) 글에 든 분류를 보여 준다.
  const typedCategory = CATEGORIES.find((c) =>
    c.match.some((word) => input.includes(word)),
  );
  const related = openKeyword
    ? CATEGORIES.find((c) => c.label === openKeyword)
    : typedCategory;

  // 이어서 물어볼 질문: 챗봇이 답 끝에 골라 준 질문(2~3개)을 쓰고,
  // 없으면 방금 질문과 같은 분류의 다른 질문을 최대 3개 보여 준다.
  const lastMessage = messages[messages.length - 1];
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text;
  const followUps =
    !loading && lastMessage.role === "bot" && !lastMessage.isError && lastUserText
      ? lastMessage.followUps && lastMessage.followUps.length > 0
        ? lastMessage.followUps
        : (CATEGORIES.find(
            (c) =>
              c.questions.includes(lastUserText) ||
              c.match.some((word) => lastUserText.includes(word)),
          )
            ?.questions.filter(
              (q) => !q.includes(lastUserText) && !lastUserText.includes(q),
            )
            .slice(0, 3) ?? [])
      : [];

  // 방금 질문이 길 안내 질문이고 챗봇이 답했으면 네이버 지도 링크를 보여 준다.
  const showMapLink =
    !loading &&
    lastMessage.role === "bot" &&
    !lastMessage.isError &&
    !!lastUserText &&
    DIRECTION_WORDS.some((word) => lastUserText.toUpperCase().includes(word));

  // 대화 기억: 새로고침하거나 휴대폰이 창을 다시 불러와도 대화가 남도록
  // 이 창(탭)에만 대화를 저장해 둔다. 창을 닫으면 지워진다.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed as Message[]);
        }
      }
    } catch {
      // 저장소를 못 쓰는 환경이면 그냥 새 대화로 시작한다.
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return; // 불러오기 전에 빈 대화로 덮어쓰지 않게 한다
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // 저장이 안 돼도 대화는 계속할 수 있다.
    }
  }, [messages, restored]);

  // 새 말이 생기면 대화 칸을 맨 아래로 내린다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 대화 초기화: 첫 인사말 상태로 되돌리고 분류·입력 칸도 비운다.
  function resetChat() {
    sessionRef.current += 1;
    setMessages([GREETING]);
    setInput("");
    setOpenKeyword(null);
    setLoading(false);
    setConfirmReset(false);
  }

  // 초기화 버튼: 대화가 있으면 실수로 지우지 않게 한 번 더 묻는다.
  function askReset() {
    if (messages.length <= 1 && !input) resetChat();
    else setConfirmReset(true);
  }

  async function handleCopy() {
    const text = conversationToText(messages);
    if (!text) return;
    setCopied((await copyText(text)) ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2000);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(input);
  }

  // 고장 난 질문을 다시 보낸다: 고장 안내와 그 질문을 지우고 같은 질문을 새로 보낸다.
  function retry(question: string) {
    if (loading) return;
    void sendQuestion(question, messages.slice(0, -2));
  }

  // 질문을 보내고 답을 받아 대화 칸에 보여 준다. (입력 칸·추천 질문·다시 시도 버튼이 함께 쓴다)
  async function sendQuestion(text: string, base: Message[] = messages) {
    const question = text.trim();
    if (!question || loading) return;

    const session = sessionRef.current;
    const next: Message[] = [...base, { role: "user", text: question }];
    setMessages(next);
    setInput("");
    setOpenKeyword(null);
    setConfirmReset(false);
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
      // 답 끝의 "추천질문:" 줄은 말풍선에서 빼고 버튼으로 바꾼다.
      const { text: answerText, followUps: picked } = splitFollowUps(data.answer);
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: answerText, followUps: picked },
      ]);
    } catch {
      if (session !== sessionRef.current) return;
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: ERROR_MESSAGE, isError: true, retryQuestion: question },
      ]);
    } finally {
      if (session === sessionRef.current) setLoading(false);
    }
  }

  // 분류에 속한 질문 버튼들 (누르면 그 질문이 바로 전송된다). 첫 화면과 대화 중 화면이 함께 쓴다.
  const questionButtons = related && (
    <div className="flex flex-col gap-2">
      {related.questions.map((question) => (
        <button
          key={question}
          type="button"
          disabled={loading}
          onClick={() => void sendQuestion(question)}
          className="min-h-11 rounded-2xl border border-white/40 bg-white/10 px-4 py-2 text-left text-[15px] leading-snug text-white transition hover:bg-white/25 disabled:opacity-40"
        >
          {question}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-none bg-black/30 text-white backdrop-blur-md sm:max-w-xl sm:rounded-3xl sm:border sm:border-white/30 sm:shadow-2xl">
      <header className="flex items-center justify-between gap-2 border-b border-white/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* 마스코트: 상자에서 로봇이 쏙쏙 튀어나오는 그림 (마이크로소프트 Fluent 3D 이모지, MIT 무료) */}
          <div className="mascot relative h-14 w-14 shrink-0" aria-hidden="true">
            <Image src="/mascot/robot.png" alt="" width={40} height={40} className="mascot-robot absolute left-2 top-[-14px]" />
            <Image src="/mascot/box.png" alt="" width={56} height={56} className="absolute bottom-[-10px] left-0" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[2px] text-white/85">공무원 직무전문교육</p>
            <h1 className="font-display text-2xl font-medium">다물어봐 챗봇</h1>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={messages.length <= 1}
            aria-label="대화 내용 복사"
            className="min-h-9 rounded-full border border-white/40 px-3 py-1 text-sm text-white hover:bg-white/20 disabled:opacity-40"
          >
            {copied === "ok" ? "✅ 복사됨" : copied === "fail" ? "복사 실패" : "📋 대화 복사"}
          </button>
          <button
            type="button"
            onClick={askReset}
            className="min-h-9 rounded-full border border-white/40 px-3 py-1 text-sm text-white hover:bg-white/20"
          >
            🔄 대화 초기화
          </button>
        </div>
      </header>

      {/* 초기화 확인: 실수로 대화를 지우지 않게 한 번 더 묻는다. */}
      {confirmReset && (
        <div
          role="alertdialog"
          aria-label="대화 초기화 확인"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-white/20 bg-[#f87b97]/25 px-4 py-2"
        >
          <p className="text-[15px]">지금까지의 대화가 모두 지워져요. 지울까요?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetChat}
              className="min-h-10 rounded-full bg-[#f87b97] px-4 text-sm font-medium text-white"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="min-h-10 rounded-full border border-white/50 px-4 text-sm text-white"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <li
            key={index}
            className={
              message.role === "user"
                ? "max-w-[88%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#f87b97] px-4 py-2.5 text-[17px] leading-relaxed text-white"
                : "max-w-[92%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/95 px-4 py-2.5 text-[17px] leading-relaxed text-zinc-900"
            }
          >
            {message.role === "bot" ? renderWithLinks(message.text) : message.text}
          </li>
        ))}
        {loading && (
          <li
            role="status"
            aria-label="답변 작성 중"
            className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-sm bg-white/90 px-4 py-3"
          >
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="thinking-dot h-2 w-2 rounded-full bg-zinc-500"
                style={{ animationDelay: `${dot * 0.2}s` }}
              />
            ))}
            <span className="ml-2 text-sm text-zinc-600">답변을 만들고 있어요</span>
          </li>
        )}

        {/* 고장 났을 때: 같은 질문을 다시 보내는 버튼 */}
        {!loading && lastMessage.isError && lastMessage.retryQuestion && (
          <li className="self-start">
            <button
              type="button"
              onClick={() => retry(lastMessage.retryQuestion!)}
              className="min-h-11 rounded-full bg-[#f87b97] px-5 py-2 text-[15px] font-medium text-white"
            >
              🔁 다시 시도
            </button>
          </li>
        )}

        {/* 첫 화면: 교육생 중심 분류 8개. 누르면 그 분류의 자주 묻는 질문이 아래에 펼쳐진다. */}
        {firstScreen && !loading && (
          <li className="flex flex-col gap-3">
            <p className="text-sm text-white/85">무엇이 궁금하세요? 분류를 눌러 보세요.</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((category) => {
                const active = openKeyword === category.label;
                return (
                  <button
                    key={category.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOpenKeyword(active ? null : category.label)}
                    className={
                      active
                        ? "min-h-12 rounded-2xl bg-[#f87b97] px-3 py-2 text-left text-[15px] font-medium text-white"
                        : "min-h-12 rounded-2xl border border-white/40 bg-white/10 px-3 py-2 text-left text-[15px] text-white hover:bg-white/20"
                    }
                  >
                    <span aria-hidden="true">{category.icon} </span>
                    {category.label}
                  </button>
                );
              })}
            </div>
            {openKeyword && related && (
              <div aria-label={`${related.label} 자주 묻는 질문`} className="flex flex-col gap-2">
                <p className="text-sm text-white/85">{related.label} · 자주 묻는 질문</p>
                {questionButtons}
              </div>
            )}
          </li>
        )}

        {showMapLink && (
          <li className="flex flex-wrap gap-2 self-start">
            <a
              href={NAVER_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#03c75a] px-4 py-2 text-[15px] font-medium text-white transition hover:brightness-110"
            >
              🗺️ 네이버 지도에서 길찾기 (새 창)
            </a>
            <a
              href={HOMEPAGE_DIRECTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/50 bg-white/10 px-4 py-2 text-[15px] font-medium text-white transition hover:bg-white/25"
            >
              🏫 홈페이지 찾아오시는 길 (새 창)
            </a>
          </li>
        )}
        {followUps.length > 0 && (
          <li className="flex flex-col gap-2 self-start">
            <span className="text-sm text-white/85">이어서 물어보기</span>
            <div className="flex flex-wrap gap-2">
              {followUps.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendQuestion(question)}
                  className="min-h-10 rounded-2xl border border-white/50 px-3 py-1.5 text-left text-[15px] leading-snug text-white hover:bg-white/20"
                >
                  {question}
                </button>
              ))}
            </div>
          </li>
        )}
        <li ref={bottomRef} aria-hidden="true" />
      </ul>

      {/* 대화 중: 입력 칸에 분류에 속한 말을 쓰면(첫 화면에서도) 관련 질문이 뜬다. */}
      {related && !(firstScreen && openKeyword) && (
        <div
          aria-label={`${related.label} 관련 질문`}
          className="flex max-h-[40%] flex-col gap-2 overflow-y-auto border-t border-white/20 px-4 py-2"
        >
          <p className="text-sm text-white/85">{related.label} 관련 질문</p>
          {questionButtons}
        </div>
      )}

      {/* 대화 중 분류 줄: 한 줄로 옆으로 밀어서 본다. 누르면 관련 질문이 펼쳐지고, 다시 누르면 접힌다. */}
      {!firstScreen && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/20 px-4 py-2">
          <span className="shrink-0 text-sm text-white/85">분류</span>
          {CATEGORIES.map((category) => {
            const active = related?.label === category.label;
            return (
              <button
                key={category.label}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  // 펼쳐 둔 분류를 다시 누르면 접고, 다른 분류를 누르면 입력 글과 상관없이 그것을 펼친다.
                  setOpenKeyword(openKeyword === category.label ? null : category.label)
                }
                className={
                  active
                    ? "min-h-10 shrink-0 whitespace-nowrap rounded-full bg-[#f87b97] px-4 text-[15px] text-white"
                    : "min-h-10 shrink-0 whitespace-nowrap rounded-full border border-white/40 px-4 text-[15px] text-white hover:bg-white/15"
                }
              >
                {category.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 개발 단위 4: 개인정보 안내 문구를 항상 보여 준다. */}
      <p
        role="note"
        className="border-t border-white/20 bg-white/10 px-4 py-2 text-[13px] leading-snug text-white/95"
      >
        ⚠️ 이름, 전화번호, 주민등록번호 등 개인정보는 입력하지 마세요. 질문은 답변을 만들기 위해 OpenAI(해외 AI 서비스)로 전달됩니다.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-white/20 p-3"
      >
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setOpenKeyword(null); // 새로 글을 쓰면 입력한 글의 분류를 따른다
          }}
          placeholder="궁금한 점을 입력하세요"
          aria-label="질문 입력"
          maxLength={MAX_QUESTION_LENGTH}
          enterKeyHint="send"
          autoComplete="off"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-white/40 bg-white/10 px-5 py-2 text-base text-white outline-none placeholder:text-white/70 focus:border-[#f87b97]"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="min-h-12 whitespace-nowrap rounded-full bg-[#f87b97] px-5 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
