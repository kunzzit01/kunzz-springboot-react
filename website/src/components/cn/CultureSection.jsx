import { Link } from 'react-router-dom';

import { AnimateOnScroll } from '../../hooks/AnimateOnScroll.jsx';

const cultures = [
  {
    title: '积极向上',
    icon: '/images/积极向上 (1).webp',
    desc: ['始终以正面心态面对挑战', '在变化中寻找成长机会'],
  },
  {
    title: '高效执行',
    icon: '/images/高效执行 (1).webp',
    desc: ['说到做到，快速响应', '追求结果导向与行动力'],
  },
  {
    title: '灵活应变',
    icon: '/images/灵活应变 (1).webp',
    desc: ['面对市场变化和问题', '保持开放思维，快速调整策略'],
  },
  {
    title: '诚信待人',
    icon: '/images/诚信待人 (1).webp',
    desc: ['以真诚与责任建立合作与信任', '是我们最基本的做人原则'],
  },
];

export default function CultureSection() {
  return (
    <section id="culture" className="culture-section">
      <AnimateOnScroll className="culture-left card-tilt-in-left">
        {cultures.map((item) => (
          <div className="culture-card" key={item.title}>
            <img src={item.icon} alt="" className="culture-icon" />
            <h3>{item.title}</h3>
            <p>
              {item.desc.map((line, i) => (
                <span key={line}>
                  {line}
                  {i < item.desc.length - 1 && <br />}
                </span>
              ))}
            </p>
          </div>
        ))}
      </AnimateOnScroll>

      <AnimateOnScroll className="culture-right">
        <h2 className="culture-title culture-scale-fade delay-6">
          我们的核心价值
          <br />
          公司文化
        </h2>
        <p className="culture-description culture-scale-fade delay-7">
          在 Kunzz Holdings，我们相信文化决定高度。我们以目标为导向，理念为基石，打造一支具备高效执行力与高度协同精神的团队。
          我们提倡扁平沟通，尊重每一位成员的成长节奏，鼓励分享、学习与共创。在这里，每一份努力都能被看见，每一次突破都值得被鼓励。
        </p>
        <Link to="/about" className="culture-button culture-scale-fade delay-8">
          了解更多 &gt;&gt;
        </Link>
      </AnimateOnScroll>
    </section>
  );
}