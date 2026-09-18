"use client";
import { useEffect, useRef, useState } from "react";
const digits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (n) => String(n.charCodeAt(0) - 1776));
export default function LoginForm() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!retry) return;
    const timer = setTimeout(() => setRetry((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [retry]);
  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);
  async function send(action: "request" | "verify") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/otp/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(
          action === "request"
            ? { phone: digits(phone), consent }
            : { challenge_id: challenge, code: digits(code) },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "تعذر إكمال الطلب. حاول لاحقًا.");
      if (action === "verify") {
        // The workspace serves a standalone Worker document, so it needs a full navigation.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/workspace#overview");
        return;
      }
      setChallenge(data.challenge_id);
      setCode("");
      setRetry(data.retry_after || 60);
      setNotice(data.message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="login-form"
      onSubmit={(e) => {
        e.preventDefault();
        void send(challenge ? "verify" : "request");
      }}
      aria-busy={busy}
    >
      {!challenge ? (
        <>
          <label htmlFor="login-phone">رقم الجوال</label>
          <input
            id="login-phone"
            name="phone"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            inputMode="tel"
            placeholder="05xxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={25}
            required
            aria-describedby="phone-hint"
            disabled={busy}
          />
          <small id="phone-hint">
            للأرقام السعودية يُضاف رمز الدولة +966 تلقائيًا.
          </small>
          <label className="login-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              disabled={busy}
            />
            <span>أوافق على استلام رمز الدخول عبر واتساب.</span>
          </label>
        </>
      ) : (
        <>
          <p className="login-phone-summary">
            رقم الجوال <b dir="ltr">{phone}</b>
          </p>
          <label htmlFor="login-code">رمز التحقق</label>
          <input
            ref={codeRef}
            id="login-code"
            name="code"
            className="login-code"
            type="text"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(digits(e.target.value).replace(/\D/g, ""))}
            required
            disabled={busy}
            aria-describedby="code-hint"
          />
          <small id="code-hint">
            أدخل الرمز المكوّن من 6 أرقام. صلاحيته 5 دقائق.
          </small>
        </>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="login-notice" role="status">
          {notice}
        </p>
      )}
      <button className="login-submit" type="submit" disabled={busy}>
        {busy
          ? "جارٍ المتابعة…"
          : challenge
            ? "دخول الديوان"
            : "إرسال الرمز عبر واتساب"}
      </button>
      {challenge && (
        <div className="login-actions">
          <button
            type="button"
            disabled={busy || retry > 0}
            onClick={() => void send("request")}
          >
            {retry > 0
              ? `إعادة الإرسال بعد ${retry} ثانية`
              : "إعادة إرسال الرمز"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setChallenge("");
              setCode("");
              setError("");
              setNotice("");
            }}
          >
            تغيير الرقم
          </button>
        </div>
      )}
    </form>
  );
}
