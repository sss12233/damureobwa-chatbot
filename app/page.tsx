import Chat from "./chat";

// 꽃 영상 배경 위에 헤더와 챗봇 창을 올린다. (영상은 외부 주소에서 불러온다)
export default function Home() {
  return (
    <>
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="fixed inset-0 -z-20 h-full w-full object-cover"
      >
        <source
          src="https://strvid.nyc3.cdn.digitaloceanspaces.com/cloudinary/flowers_motion_r54og5.webm"
          type="video/webm"
        />
        <source
          src="https://strvid.nyc3.cdn.digitaloceanspaces.com/cloudinary/flowers_motion_r54og5.mp4"
          type="video/mp4"
        />
      </video>
      {/* 글자가 잘 보이도록 영상 위에 옅은 그림자를 깐다 */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/15 to-black/20" />

      <main className="relative z-0 flex h-dvh flex-col px-[5%] text-white">
        <header className="flex items-center justify-between py-5 sm:py-8">
          <div className="flex items-center gap-3 text-[1.05rem] font-medium tracking-[2px]">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5" />
              <path d="M12 7.5V9M7.5 12H9m7.5 0H15m-3 4.5V15" />
            </svg>
            <span>다물어봐</span>
          </div>
          <a
            href="tel:0415309078"
            className="inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-2.5 text-sm font-light transition hover:bg-white/15"
          >
            전화 문의 041-530-9078
          </a>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center pb-5 sm:pb-8">
          <Chat />
        </div>
      </main>
    </>
  );
}
