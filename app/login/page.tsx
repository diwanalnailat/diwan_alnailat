import LoginForm from "./login-form";
import "./login.css";
export const metadata = { title: "دخول الديوان | النائلات" };
export default function LoginPage() {
  return (
    <main className="diwan-login">
      <a className="login-back" href="/heritage">
        العودة إلى النائلات
      </a>
      <section className="login-panel" aria-labelledby="login-title">
        {/* Existing local brand artwork preserves the platform identity. */}
        <img
          className="login-mark"
          src="/brand/isotype.png"
          alt="شعار النائلات"
          width="72"
          height="84"
        />
        <p className="login-eyebrow">ديوان النائلات</p>
        <h1 id="login-title">مرحبًا بعودتك</h1>
        <p className="login-intro">
          ادخل إلى مساحة عملك برمز تحقق يصلك على واتساب.
        </p>
        <LoginForm />
        <p className="login-footnote">
          الدخول متاح لأعضاء الديوان المسجلين والمفعّلين.
        </p>
      </section>
    </main>
  );
}
