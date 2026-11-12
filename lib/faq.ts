// 교육생 중심 카테고리와 자주 묻는 질문 표 (화면과 AI 지시문이 함께 쓴다)
// 규칙: 여기 있는 질문은 data/guide.md에 "답" 또는 "확인된 안내가 없다는 사실 + 문의처"가 있는 것만 둔다.
// guide.md를 고치면 이 표도 함께 고친다. (질문 글을 바꾸면 AI의 '추천 질문' 후보도 같이 바뀐다)

export type Category = {
  label: string; // 버튼에 보이는 이름
  icon: string;
  match: string[]; // 입력 칸에 이런 말을 쓰면 이 분류의 질문이 뜬다
  questions: string[];
};

export const CATEGORIES: Category[] = [
  {
    label: "신청·변경·취소",
    icon: "📝",
    match: ["신청", "취소", "변경", "대기", "마감", "접수"],
    questions: [
      "교육 신청은 어디서 하나요?",
      "신청이 잘 됐는지 어떻게 확인하나요?",
      "교육이 마감됐는데 대기자 등록은 어떻게 하나요?",
      "교육을 취소하려면 어떻게 하나요?",
    ],
  },
  {
    label: "찾아오는 길",
    icon: "🚌",
    match: ["오시는", "찾아오", "교통", "주차", "택시", "주소", "위치", "역에서", "셔틀", "버스", "기차"],
    questions: [
      "천안아산역에서 어떻게 가나요?",
      "교육장 주소가 어떻게 되나요?",
      "주차할 수 있나요?",
      "택시는 어떻게 부르나요?",
    ],
  },
  {
    label: "숙소·입퇴실",
    icon: "🛏️",
    match: ["숙소", "숙박", "비품", "객실", "입실", "퇴실", "방", "수건", "샴푸", "충전"],
    questions: [
      "교육 전날 숙박할 수 있나요?",
      "숙소에 뭐가 있나요?",
      "입실·퇴실은 몇 시예요?",
      "숙소 키를 잃어버렸어요",
    ],
  },
  {
    label: "식사·편의시설",
    icon: "🍚",
    match: ["식당", "식사", "매점", "밥", "와이파이", "흡연", "편의", "ATM", "카페"],
    questions: [
      "교육 기간 중 식사는 제공되나요?",
      "식사 시간은 언제예요?",
      "매점은 어디에 있나요?",
      "와이파이를 쓸 수 있나요?",
    ],
  },
  {
    label: "교육비·준비물",
    icon: "💰",
    match: ["교육비", "비용", "무료", "준비물", "지참", "노트북", "필기", "챙겨"],
    questions: [
      "교육비는 얼마인가요?",
      "교육비에 숙식비가 포함되나요?",
      "노트북을 가져가야 하나요?",
      "칫솔·샴푸 같은 세면도구도 챙겨야 하나요?",
    ],
  },
  {
    label: "일정·출결",
    icon: "📅",
    match: ["일정", "출석", "출결", "지각", "조퇴", "외출", "시간표", "몇 시", "줌", "ZOOM"],
    questions: [
      "교육 일정은 어디서 확인하나요?",
      "온라인 수강은 어떻게 하나요?",
      "교육 중에 외출할 수 있나요?",
      "내 출석률을 알 수 있나요?",
    ],
  },
  {
    label: "수료증·교육시간",
    icon: "🎓",
    match: ["수료", "교육시간", "인정"],
    questions: [
      "수료증은 어디서 발급받나요?",
      "수료증은 언제부터 받을 수 있나요?",
      "수료 기준이 뭔가요?",
    ],
  },
  {
    label: "담당자 문의",
    icon: "📞",
    match: ["연락", "전화", "문의", "담당", "로그인", "비밀번호"],
    questions: [
      "담당자 전화번호와 문의 시간을 알려 주세요",
      "홈페이지 로그인이 안 돼요",
    ],
  },
];

// 모든 질문을 한 줄로 편 목록 (AI가 '이어서 물어볼 질문'을 이 중에서 고르게 한다)
export const ALL_QUESTIONS: string[] = CATEGORIES.flatMap((c) => c.questions);

// 챗봇 답변 맨 끝의 "추천질문: A | B | C" 줄을 떼어 내고, 표에 있는 질문만 남긴다.
export function splitFollowUps(answer: string): { text: string; followUps: string[] } {
  const lines = answer.split("\n");
  const index = lines.findIndex((line) => /^\s*추천\s*질문\s*[:：]/.test(line));
  if (index === -1) return { text: answer.trim(), followUps: [] };
  const picked = lines[index]
    .replace(/^\s*추천\s*질문\s*[:：]/, "")
    .split("|")
    .map((q) => q.trim())
    .filter((q) => ALL_QUESTIONS.includes(q));
  const text = lines.slice(0, index).join("\n").trim();
  return { text: text || answer.trim(), followUps: picked.slice(0, 3) };
}
