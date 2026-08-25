import { AnimateOnScroll } from '../../../hooks/AnimateOnScroll.jsx';

export default function AboutVision() {
  return (
    <section id="vision" className="vision">
      <AnimateOnScroll className="vision-content vision-slide-down">
        <h1>我们的信念与方向</h1>
        <p>
          我们相信，所有伟大的成就，都始于一份清晰的信念。
          <br />
          使命、愿景、文化与价值观，是前进的灯塔，也是我们共同坚守的底线。
          <br />
          在这样的理念指引下，我们持续成长、持续突破、持续成就彼此。
        </p>

        <div className="vision-cards">
          <AnimateOnScroll className="vision-card slide-in-left">
            <div className="vision-label">我们的使命</div>
            <h2>塑造积极向上和舒适的工作环境</h2>
            <p>
              在这里，我们相信好的工作环境，能孕育出更好的团队。
              我们努力打造一个温暖、有温度、有归属感的空间，
              让每位成员都能安心发挥，共同成长。
              在这里，挑战不再冰冷，努力也值得被看见。
            </p>
          </AnimateOnScroll>

          <AnimateOnScroll className="vision-card slide-in-right">
            <div className="vision-label">我们的愿景</div>
            <h2>打造高效的团队，创造行业未来</h2>
            <p>
              一个好团队，是企业价值持续创造的源头。
              唯有高效与创新并行，团队才能突破边界、成就非凡。
              我们正以坚实步伐，走在打造行业标杆的路上，
              用成就说话，用信念前行。
            </p>
          </AnimateOnScroll>
        </div>
      </AnimateOnScroll>
    </section>
  );
}
