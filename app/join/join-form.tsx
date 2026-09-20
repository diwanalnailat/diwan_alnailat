"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import SaudiPhoneInput, {
  saudiLocalPhone,
} from "../../components/saudi-phone-input";

type Options = {
  committees: { id: string; name: string; project_title: string }[];
  policy: { title: string; content: string; version: number };
};
type Details = {
  name: string;
  phone: string;
  reason: string;
  committee_id: string | null;
  policy_version: number;
  consent: boolean;
};
const englishDigits = (value: string) =>
  value.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit <= "٩" ? 1632 : 1776)),
  );

async function fetchOptions(signal?: AbortSignal): Promise<Options> {
  const response = await fetch("/auth/join/options", {
    cache: "no-store",
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "تعذر تحميل خيارات الانضمام.");
  return result;
}

export default function JoinForm() {
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [committee, setCommittee] = useState("");
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [submittedDetails, setSubmittedDetails] = useState<Details | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [complete, setComplete] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  async function loadOptions() {
    try {
      setOptions(await fetchOptions());
    } catch {
      setError("تعذر تحميل خيارات الانضمام. أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetchOptions(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setOptions(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("تعذر تحميل خيارات الانضمام. أعد المحاولة.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!retry) return;
    const timer = setTimeout(
      () => setRetry((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [retry]);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge]);

  async function requestCode(details: Details) {
    const response = await fetch("/auth/join/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(details),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "تعذر إرسال رمز التحقق.");
    setSubmittedDetails(details);
    setChallenge(result.challenge_id);
    setCode("");
    setRetry(result.retry_after || 60);
    setNotice(
      result.message ||
        "أرسلنا رمز التحقق إلى واتساب. الرمز صالح لمدة 5 دقائق.",
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !options) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!challenge) {
        await requestCode({
          name: name.trim(),
          phone: "+966" + saudiLocalPhone(phone),
          reason: reason.trim(),
          committee_id: committee || null,
          policy_version: options.policy.version,
          consent,
        });
      } else {
        const response = await fetch("/auth/join/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ challenge_id: challenge, code }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "تعذر التحقق من الرمز.");
        setNotice(
          result.message ||
            "تم توثيق رقمك وإرسال طلبك إلى إدارة الديوان للمراجعة.",
        );
        setComplete(true);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "تعذر الاتصال. حاول مرة أخرى.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (busy || retry || !submittedDetails) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestCode(submittedDetails);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "تعذر إرسال الرمز.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (complete)
    return (
      <div className="join-success" role="status">
        <h2>وصل طلب انضمامك</h2>
        <p>{notice}</p>
        <p>
          يمكنك الدخول برقم جوالك بعد موافقة الإدارة أو المشرف المكلّف بمراجعة
          طلبك.
        </p>
        <a className="login-submit" href="/heritage">
          العودة إلى النائلات
        </a>
      </div>
    );
  if (!options)
    return (
      <div className="join-loading" aria-busy={loading}>
        {loading ? (
          <p role="status">جارٍ تحميل خيارات الانضمام…</p>
        ) : (
          <>
            <p className="login-error" role="alert">
              {error}
            </p>
            <button
              className="login-submit"
              onClick={() => {
                setLoading(true);
                setError("");
                void loadOptions();
              }}
            >
              إعادة المحاولة
            </button>
          </>
        )}
      </div>
    );

  return (
    <form className="login-form join-form" onSubmit={submit} aria-busy={busy}>
      <ol className="join-steps" aria-label="خطوات طلب الانضمام">
        <li aria-current={!challenge ? "step" : undefined}>
          1 · بيانات الانضمام
        </li>
        <li aria-current={challenge ? "step" : undefined}>
          2 · توثيق الجوال وإرسال الطلب
        </li>
      </ol>
      {!challenge ? (
        <>
          <label htmlFor="join-name">الاسم الكامل</label>
          <input
            id="join-name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
          <label htmlFor="join-phone">رقم الجوال</label>
          <SaudiPhoneInput
            id="join-phone"
            value={phone}
            onChange={setPhone}
            disabled={busy}
            describedBy="join-phone-note"
          />
          <small id="join-phone-note">
            رقمك المسجّل في واتساب، بدءًا من 5؛ رمز الدولة ثابت.
          </small>
          <label htmlFor="join-committee">جهة الانضمام</label>
          <select
            id="join-committee"
            name="committee_id"
            value={committee}
            onChange={(event) => setCommittee(event.target.value)}
            disabled={busy || !options.committees.length}
          >
            <option value="">الانضمام المباشر للديوان</option>
            {options.committees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.project_title ? ` · ${item.project_title}` : ""}
              </option>
            ))}
          </select>
          {!options.committees.length && (
            <small>
              لا توجد لجان متاحة حاليًا؛ سيُرفع طلبك إلى الديوان مباشرة.
            </small>
          )}
          <label htmlFor="join-reason">سبب الانضمام</label>
          <textarea
            id="join-reason"
            name="reason"
            rows={4}
            required
            minLength={3}
            maxLength={2000}
            placeholder="أخبرنا عن رغبتك في الانضمام وما يمكنك المشاركة به."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
          <details className="join-policy">
            <summary>{options.policy.title || "شروط وسياسة الانضمام"}</summary>
            <div>{options.policy.content}</div>
          </details>
          <label className="login-consent" htmlFor="join-consent">
            <input
              id="join-consent"
              type="checkbox"
              required
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={busy}
            />
            <span>
              اطلعت على شروط وسياسة الانضمام وأوافق عليها، وأوافق على استلام رمز
              التحقق عبر واتساب.
            </span>
          </label>
        </>
      ) : (
        <>
          <div className="join-review">
            <strong>{submittedDetails?.name}</strong>
            <span dir="ltr">{submittedDetails?.phone}</span>
            <span>
              {options.committees.find(
                (item) => item.id === submittedDetails?.committee_id,
              )?.name || "الانضمام المباشر للديوان"}
            </span>
          </div>
          <label htmlFor="join-code">رمز التحقق المرسل إلى واتساب</label>
          <input
            ref={codeInput}
            id="join-code"
            name="code"
            className="login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            pattern="[0-9]{6}"
            required
            minLength={6}
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(englishDigits(event.target.value).replace(/\D/g, ""))
            }
            disabled={busy}
            aria-describedby="join-code-note"
          />
          <small id="join-code-note">
            أدخل الرمز المكوّن من 6 أرقام خلال 5 دقائق لإرسال طلبك.
          </small>
        </>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="login-notice" role="status">
          {notice}
        </p>
      )}
      <button
        type="submit"
        className="login-submit"
        disabled={busy || (!challenge && !consent)}
      >
        {busy
          ? "جارٍ التنفيذ…"
          : challenge
            ? "تحقق وأرسل طلب الانضمام"
            : "إرسال رمز التحقق إلى واتساب"}
      </button>
      {challenge && (
        <div className="login-actions">
          <button
            type="button"
            disabled={busy || retry > 0}
            onClick={() => void resend()}
          >
            {retry ? `إعادة الإرسال بعد ${retry} ثانية` : "إعادة إرسال الرمز"}
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
            تعديل بيانات الطلب
          </button>
        </div>
      )}
    </form>
  );
}
