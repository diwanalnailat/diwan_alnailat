import type { HeritageSeason } from "../../lib/heritage/types";
import { SeasonTabs } from "./season-tabs";
import { Reveal } from "./reveal";

function Arrow() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M19 12H5m7 7-7-7 7-7" />
    </svg>
  );
}

function EntryLink() {
  return (
    <a className="nw-enter" href="/workspace#overview">
      دخول الديوان <Arrow />
    </a>
  );
}

function Hero() {
  return (
    <section className="nailat-hero" aria-labelledby="heritage-title">
      <img
        className="nw-landscape"
        src="/brand/caravan-photo.png"
        width="1078"
        height="719"
        fetchPriority="high"
        alt="منقية النائلات في الصياهد"
      />
      <header className="heritage-nav nw-nav">
        <a
          className="nw-brand"
          href="/heritage"
          aria-label="النائلات، الصفحة الرئيسية"
        >
          <img src="/brand/isotype.png" width="58" height="54" alt="" />
          <span>
            <strong>النائلات</strong>
            <small>منقية الوضح</small>
          </span>
        </a>
        <nav className="nw-links" aria-label="عن النائلات">
          <a href="#nailat-story">عن النائلات</a>
          <a href="#nailat-honor">لحظة التكريم</a>
          <a href="#nailat-achievements">سجل الإنجازات</a>
        </nav>
        <EntryLink />
      </header>
      <div className="nw-hero-body">
        <div className="nw-hero-copy">
          <span className="nw-eyebrow">
            مهرجان الملك عبدالعزيز للإبل · الصياهد
          </span>
          <h1 id="heritage-title">
            النائلات<span>للأصالة راية.</span>
          </h1>
          <p>
            نوادر الوضح، وعزيمةٌ تتجدد.
            <br />
            إرثٌ أصيل، وإنجازٌ يتجدد في الميدان.
          </p>
          <a className="nw-scroll" href="#nailat-achievements">
            <b aria-hidden="true">↓</b>اكتشف مسيرة النائلات
          </a>
        </div>
      </div>
      <div className="nw-hero-foot">
        <span>منقية الشيخ عبدالله بن عامر النهدي</span>
        <span>أصالة الموروث. ورفعة الحضور.</span>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section
      className="nw-story"
      id="nailat-story"
      aria-labelledby="story-title"
    >
      <Reveal>
        <span className="nw-section-label">إرث نعتز به</span>
        <h2 id="story-title">
          في الوضح أصالة.<em>وللنائلات مكانة.</em>
        </h2>
      </Reveal>
      <Reveal className="nw-story-copy">
        <p>
          يجمعنا الشغف بالإبل، والاعتزاز بموروثٍ نحمله إلى الأجيال. وفي ميادين
          مهرجان الملك عبدالعزيز للإبل، تتجدد مسيرة النائلات؛ بعنايةٍ بالمنقية،
          وعزيمةٍ على المنافسة، وفرحةٍ بكل إنجاز.
        </p>
        <img
          src="/brand/signature.png"
          width="617"
          height="165"
          alt="منقية النائلات الوضح"
          loading="lazy"
        />
      </Reveal>
    </section>
  );
}

function Honor() {
  return (
    <section
      className="nw-honor"
      id="nailat-honor"
      aria-labelledby="honor-title"
    >
      <Reveal className="nw-honor-copy">
        <img
          className="nw-watermark"
          src="/brand/isotype.png"
          alt=""
          loading="lazy"
        />
        <span className="nw-section-label">لحظة التكريم</span>
        <h2 id="honor-title">
          تشريفٌ نعتزّ به.
          <br />
          <em>وفخرٌ نحمله.</em>
        </h2>
        <p>
          سمو ولي العهد الأمير محمد بن سلمان يكرّم الشيخ عبدالله بن عامر النهدي،
          في ختام النسخة 9 من مهرجان الملك عبدالعزيز للإبل.
        </p>
        <div className="nw-honor-caption">
          فرحة الإنجاز تكتمل بهذا التشريف.
          <br />
          <span>
            قصر اليمامة · الرياض · <bdi>2025</bdi>
          </span>
        </div>
      </Reveal>
      <figure className="nw-honor-photo">
        <img
          src="/brand/honoring.jpg"
          width="1280"
          height="1127"
          alt="سمو ولي العهد الأمير محمد بن سلمان يسلم راية التكريم للشيخ عبدالله بن عامر النهدي"
          loading="lazy"
        />
      </figure>
    </section>
  );
}

function Achievements({ seasons }: { seasons: HeritageSeason[] }) {
  return (
    <section
      className="nw-archive"
      id="nailat-achievements"
      aria-labelledby="archive-title"
    >
      <Reveal className="nw-archive-head">
        <div>
          <span className="nw-section-label">محطات الحضور</span>
          <h2 id="archive-title">
            بيارقٌ ترتفع.
            <br />
            <em>ومسيرةٌ تُروى.</em>
          </h2>
        </div>
        <p>تصفّح المواسم، واكتشف نتائج النائلات في أشواط الجمل والفرديات.</p>
      </Reveal>
      <SeasonTabs seasons={seasons} />
      <div className="nw-archive-note">
        <span>مهرجان الملك عبدالعزيز للإبل</span>
        <span>منقية النائلات · لون الوضح</span>
      </div>
    </section>
  );
}

function FieldPresence() {
  return (
    <section
      className="nw-photo-essay nw-field-presence nw-panorama"
      aria-label="من إرث النائلات"
    >
      <figure>
        <img
          src="/brand/white-camel-closeup.png"
          width="1375"
          height="778"
          alt="لقطة قريبة للوضح بخلفية صافية، من الهوية البصرية للنائلات"
          loading="lazy"
        />
      </figure>
      <div className="nw-panorama-caption">
        <span>شغفٌ يُورث. وعنايةٌ تُثمر.</span>
        <h2>
          قريبون من إرثنا.
          <br />
          ماضون بعزيمتنا.
        </h2>
      </div>
    </section>
  );
}

function DiwanEntry() {
  return (
    <section
      className="nw-diwan"
      id="diwan-entry"
      aria-labelledby="entry-title"
    >
      <span className="nw-section-label">ديوان النائلات</span>
      <h2 id="entry-title">جهودٌ تتكامل. وإنجازٌ يتحقق.</h2>
      <p>
        هنا تجتمع جهود فريق النائلات، وتنتظم أعمال اللجان، وتكتمل تفاصيل
        المشاركة.
      </p>
      <div className="nw-diwan-actions">
        <EntryLink />
        <a className="nw-outline" href="/workspace?join=1#heritage">
          طلب الانضمام
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="nw-footer">
      <img
        src="/brand/signature.png"
        width="617"
        height="165"
        alt="منقية النائلات الوضح"
        loading="lazy"
      />
      <div className="nw-footer-social">
        <span>تابع النائلات</span>
        <a
          href="https://x.com/alnailat"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="حساب النائلات على منصة X"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              d="m4 3 16 18h-4L0 3h4ZM20 3 4 21"
              transform="translate(2 0) scale(.85 1)"
            />
          </svg>
          <bdi>@alnailat</bdi>
        </a>
      </div>
      <a href="#heritage">العودة للأعلى ↑</a>
    </footer>
  );
}

export function HeritagePage({ seasons }: { seasons: HeritageSeason[] }) {
  return (
    <>
      <a href="#nailat-story" className="skip-link">
        تجاوز المقدمة إلى المحتوى
      </a>
      <main id="main" tabIndex={-1}>
        <div id="heritage" className="heritage-home nailat-world">
          <Hero />
          <Story />
          <Honor />
          <Achievements seasons={seasons} />
          <FieldPresence />
          <DiwanEntry />
          <Footer />
        </div>
      </main>
    </>
  );
}
