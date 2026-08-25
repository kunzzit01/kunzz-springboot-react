import { AnimateOnScroll } from '../../../hooks/AnimateOnScroll.jsx';

const values = [
  {
    title: '目标导向',
    icon: '/images/目标导向.webp',
    desc: '以结果为导向，聚焦关键任务，明确每一步的方向与意义。',
  },
  {
    title: '理念一致',
    icon: '/images/理念一致.webp',
    desc: '保持高度共识，思想同频，目标一致，减少内耗。',
  },
  {
    title: '追求卓越',
    icon: '/images/追求卓越.webp',
    desc: '不满足于完成任务，要追求干得更好，更高标准地完成目标，持续优化每项工作。',
  },
  {
    title: '创新精神',
    icon: '/images/创新精神.webp',
    desc: '拥抱变化、敢于尝试，突破既有框架，不断探索新方法、新工具与新角度，推动企业成长。',
  },
];

export default function AboutValues() {
  return (
    <section id="values" className="values-section">
      <AnimateOnScroll className="values-top">
        <h2 className="values-title values-scale-fade delay-3">
          我们的核心<span style={{ color: '#FF5C00' }}>价值观</span>
        </h2>
        <p className="values-description values-scale-fade delay-4">
          核心价值观，贯穿在每一份努力、每一个团队协作之中。
          它让我们在文化中凝聚一致，在挑战中保持信念，
          在成长中维持不变的初心。
        </p>
      </AnimateOnScroll>

      <AnimateOnScroll className="values-bottom card-tilt-in-left">
        {values.map((item) => (
          <div className="values-card" key={item.title}>
            <img src={item.icon} alt="" className="values-icon" />
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
        ))}
      </AnimateOnScroll>
    </section>
  );
}
