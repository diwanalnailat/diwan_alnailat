"use client";

export default function HeritageError({ reset }: { reset: () => void }) {
  return (
    <main className="nailat-world">
      <section className="nw-diwan" role="alert">
        <h1>تعذر تحميل سجل النائلات</h1>
        <p>تحقق من الاتصال ثم أعد المحاولة.</p>
        <button className="nw-enter" onClick={reset}>
          إعادة المحاولة
        </button>
      </section>
    </main>
  );
}
