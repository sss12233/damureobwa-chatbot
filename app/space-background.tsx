import Image from "next/image";

// 우주 배경: 반짝이는 별 + 화면을 둥둥 떠다니는 로봇
// 별 위치는 매번 같은 결과가 나오는 "정해진 난수"로 만든다. (화면이 깜빡이며 바뀌지 않게)
function makeStars(count: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: rand() < 0.85 ? 1 + rand() * 1.5 : 2.5 + rand() * 1.5,
    delay: rand() * 4,
    duration: 2 + rand() * 3,
  }));
}

const STARS = makeStars(140, 7);

export default function SpaceBackground() {
  return (
    <div aria-hidden="true" className="space-bg fixed inset-0 -z-20 overflow-hidden">
      {STARS.map((star, i) => (
        <span
          key={i}
          className="space-star absolute rounded-full bg-white"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}

      {/* 로봇: 바깥 상자는 화면 곳곳을 돌아다니고, 안쪽 그림은 빙글빙글 둥둥 뜬다 */}
      <div className="space-robot-path absolute left-0 top-0">
        <Image
          src="/mascot/robot.png"
          alt=""
          width={96}
          height={96}
          priority
          className="space-robot-spin"
        />
      </div>
    </div>
  );
}
