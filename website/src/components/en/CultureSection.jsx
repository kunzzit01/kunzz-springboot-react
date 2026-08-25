import { AnimateOnScroll } from '../../hooks/AnimateOnScroll.jsx';
import { PHP_BASE } from '../../config.js';

const cultures = [
  {
    title: 'Positive',
    icon: '/images/积极向上 (1).webp',
    desc: ['Stay Positive in Challenges', 'Embrace Change to Grow'],
  },
  {
    title: 'Efficient',
    icon: '/images/高效执行 (1).webp',
    desc: ['Say it, do it. Respond fast,', 'Result-Driven & Action-Oriented'],
  },
  {
    title: 'Flexible',
    icon: '/images/灵活应变 (1).webp',
    desc: ['Face Change and Challenges' ,'Stay Open and Adjust Fast'],
  },
  {
    title: 'Honesty',
    icon: '/images/诚信待人 (1).webp',
    desc: ['Build Trust with Sincerity', 'is Our Core Principle'],
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

      <div className="culture-right">
        <AnimateOnScroll as="h2" className="culture-title culture-scale-fade delay-6">
          Our Core Values
          <br />
          Company Culture
        </AnimateOnScroll>
        <AnimateOnScroll as="p" className="culture-description culture-scale-fade delay-7">
          At Kunzz Holdings, we believe that culture determines height. We are goal-oriented and based on ideas to build a team with efficient execution and high collaborative spirit. We advocate flat communication, respect the growth rhythm of each member, and encourage sharing, learning and co-creation. Here, every effort can be seen and every breakthrough is worth encouraging.
        </AnimateOnScroll>
        <AnimateOnScroll
          as="a"
          href={`/about_en`}
          className="culture-button culture-scale-fade delay-8"
        >
          Learn More &gt;&gt;
        </AnimateOnScroll>
      </div>
    </section>
  );
}