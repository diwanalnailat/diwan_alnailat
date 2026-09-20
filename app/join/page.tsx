import JoinForm from "./join-form";
import "../login/login.css";
import "./join.css";

export const metadata = { title: "طلب الانضمام | ديوان النائلات" };

export default function JoinPage() {
  return (
    <main className="diwan-login diwan-join">
      <a className="login-back" href="/heritage">
        العودة إلى النائلات
      </a>
      <section className="login-panel join-panel" aria-labelledby="join-title">
        <p className="login-eyebrow">ديوان النائلات</p>
        <h1 id="join-title">طلب الانضمام</h1>
        <p className="login-intro">
          عرّفنا بنفسك واختر وجهة انضمامك. بعد توثيق جوالك، يصل طلبك إلى إدارة
          الديوان للمراجعة.
        </p>
        <JoinForm />
        <p className="login-footnote">
          لديك حساب مفعّل؟ <a href="/login">دخول الديوان</a>
        </p>
      </section>
    </main>
  );
}
