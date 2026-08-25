export default function SocialSidebar() {
  return (
    <div className="social-sidebar">
      <a
        href="https://www.facebook.com/share/16ZihY9RN6/"
        target="_blank"
        rel="noreferrer"
        className="social-icon facebook"
        title="进入 Facebook 世界"
      >
        <img src="/images/fbicon.webp" alt="Facebook" />
      </a>

      <a
        href="https://www.instagram.com"
        target="_blank"
        rel="noreferrer"
        className="social-icon instagram"
        title="探索 Instagram 精彩"
      >
        <img src="/images/igicon.webp" alt="Instagram" />
      </a>

      <a
        href="https://wa.me/60135535355"
        target="_blank"
        rel="noreferrer"
        className="social-icon whatsapp"
        title="通过 WhatsApp 联系我们"
      >
        <img src="/images/wsicon.webp" alt="WhatsApp" />
      </a>
    </div>
  );
}
