import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { getJoinSectionSlide } from '../../utils/joinSlides.js';

/**
 * Footer content only — must sit inside SwiperSlide.footer-slide (see Home.jsx).
 * Matches public/footer.php structure.
 */
export default function Footer({ onSlideTo, page = 'home' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isAbout = page === 'about' || location.pathname === '/about';
  const isJoin = page === 'join' || location.pathname === '/joinus';
  const isMobile = useIsMobile();
  const joinSlide = (section) => getJoinSectionSlide(section, isMobile);

  const goToHomeSlide = (e, slide) => {
    e.preventDefault();
    if (location.pathname === '/') {
      onSlideTo?.(slide);
    } else {
      navigate(`/?slide=${slide}`);
    }
  };

  const goToAboutSlide = (e, slide) => {
    e.preventDefault();
    if (isAbout) {
      onSlideTo?.(slide);
    } else {
      navigate(`/about?slide=${slide}`);
    }
  };

  const goToJoinSlide = (e, slide) => {
    e.preventDefault();
    if (isJoin) {
      onSlideTo?.(slide);
    } else {
      navigate(`/joinus?slide=${slide}`);
    }
  };

  return (
    <>
      <footer className="footer">
        <div className="footer-section">
          <h4>
            <Link to="/">首页</Link>
          </h4>
          <ul>
            <li>
              <a href="/?slide=1" onClick={(e) => goToHomeSlide(e, 1)}>
                公司简介
              </a>
            </li>
            <li>
              <a href="/?slide=2" onClick={(e) => goToHomeSlide(e, 2)}>
                公司文化
              </a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>
            <Link to="/about">关于我们</Link>
          </h4>
          <ul>
            <li>
              <a href="/about?slide=0" onClick={(e) => goToAboutSlide(e, 0)}>
                集团简介
              </a>
            </li>
            <li>
              <a href="/about?slide=1" onClick={(e) => goToAboutSlide(e, 1)}>
                信念与方向
              </a>
            </li>
            <li>
              <a href="/about?slide=2" onClick={(e) => goToAboutSlide(e, 2)}>
                核心价值观
              </a>
            </li>
            <li>
              <a href="/about?slide=3" onClick={(e) => goToAboutSlide(e, 3)}>
                发展历史
              </a>
            </li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>
            <Link to="/joinus">加入我们</Link>
          </h4>
          <ul>
            <li>
              <a
                href={`/joinus?slide=${joinSlide('benefits')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('benefits'))}
              >
                公司福利
              </a>
            </li>
            <li>
              <a
                href={`/joinus?slide=${joinSlide('comphoto')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('comphoto'))}
              >
                我们的足迹
              </a>
            </li>
            <li>
              <a
                href={`/joinus?slide=${joinSlide('jobs')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('jobs'))}
              >
                招聘的职位
              </a>
            </li>
            <li>
              <a
                href={`/joinus?slide=${joinSlide('contact')}`}
                onClick={(e) => goToJoinSlide(e, joinSlide('contact'))}
              >
                联系我们
              </a>
            </li>
          </ul>
        </div>
      </footer>

      <div className="footer-bottom">
        © 2025 Kunzz Holdings Sdn. Bhd. 版权所有。
      </div>
    </>
  );
}
