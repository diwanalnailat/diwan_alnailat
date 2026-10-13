"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import SaudiPhoneInput, {
  saudiLocalPhone,
} from "../../components/saudi-phone-input";
import {
  JOIN_ATTESTATION,
  JOIN_MAX_BYTES,
  JOIN_MAX_FILES,
  JOIN_FILE_MAX_BYTES,
  JOIN_CHUNK_BYTES,
} from "../../lib/join-attachment-policy";

type Attachment = { kind: "identity" | "experience"; file: File };

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
  attestation: boolean;
  attachments: { kind: string; name: string; size: number; parts: string[] }[];
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

async function uploadRequest(action: string, options: RequestInit) {
  const response = await fetch(`/auth/join/${action}`, {
    ...options,
    method: "POST",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      result?.error ||
        "تعذر إكمال الرفع. أعد المحاولة لاستكمال الأجزاء الناقصة.",
    );
  if (!result) throw new Error("تعذر تأكيد الرفع. أعد المحاولة.");
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
  const [attestation, setAttestation] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState("");
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
  const [uploadToken, setUploadToken] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  function chooseFiles(kind: Attachment["kind"], input: HTMLInputElement) {
    const selected = Array.from(input.files || []).map((file) => ({
      kind,
      file,
    }));
    const next = [
      ...attachments.filter((item) => item.kind !== kind),
      ...selected,
    ].sort(
      (a, b) => Number(b.kind === "identity") - Number(a.kind === "identity"),
    );
    if (next.length > JOIN_MAX_FILES) {
      setFileError(
        "لم يُضف الاختيار الجديد: الحد الأقصى 6 ملفات. قلّل عدد الملفات وأعد الاختيار.",
      );
      input.value = "";
      return;
    }
    const total = next.reduce((sum, item) => sum + item.file.size, 0);
    if (
      total > JOIN_MAX_BYTES ||
      next.some(({ file }) => file.size > JOIN_FILE_MAX_BYTES)
    ) {
      setFileError(
        `لم يُضف الاختيار الجديد: الحد 100 ميغابايت للملف و300 ميغابايت للمرفقات مجتمعة. مجموع اختيارك ${(total / 1024 / 1024).toFixed(2)} ميغابايت.`,
      );
      input.value = "";
      return;
    }
    if (selected.some(({ file }) => !file.size || file.name.length > 180)) {
      setFileError(
        "لم يُضف الاختيار الجديد: اختر ملفًا غير فارغ باسم لا يتجاوز 180 حرفًا.",
      );
      input.value = "";
      return;
    }
    setAttachments(next);
    setFileError("");
    setError("");
  }

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
    setUploadToken("");
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
        const manifest: Details["attachments"] = [];
        for (const { kind, file } of attachments) {
          setNotice(`جارٍ تجهيز ${file.name}…`);
          const parts: string[] = [];
          for (let offset = 0; offset < file.size; offset += JOIN_CHUNK_BYTES) {
            parts.push(
              Array.from(
                new Uint8Array(
                  await crypto.subtle.digest(
                    "SHA-256",
                    await file
                      .slice(offset, offset + JOIN_CHUNK_BYTES)
                      .arrayBuffer(),
                  ),
                ),
                (byte) => byte.toString(16).padStart(2, "0"),
              ).join(""),
            );
          }
          manifest.push({ kind, name: file.name, size: file.size, parts });
        }
        await requestCode({
          name: name.trim(),
          phone: "+966" + saudiLocalPhone(phone),
          reason: reason.trim(),
          committee_id: committee || null,
          policy_version: options.policy.version,
          consent,
          attestation,
          attachments: manifest,
        });
      } else {
        let activeToken = uploadToken;
        if (!activeToken) {
          const result = await uploadRequest("verify", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              challenge_id: challenge,
              code,
              ...(attachments.length ? { upload_mode: "chunked" } : {}),
            }),
          });
          activeToken = result.upload_token || "";
          setUploadToken(activeToken);
        }
        if (activeToken) {
          const headers = {
            "x-join-challenge": challenge,
            "x-join-upload": activeToken,
          };
          const status = await uploadRequest("upload-status", { headers });
          if (!status.complete) {
            const uploaded = new Set(
              (status.uploaded as number[][]).map(
                ([file, part]) => `${file}:${part}`,
              ),
            );
            const total = attachments.reduce(
              (sum, item) => sum + item.file.size,
              0,
            );
            let sent = 0;
            for (let index = 0; index < attachments.length; index++) {
              const file = attachments[index].file;
              for (
                let part = 0, offset = 0;
                offset < file.size;
                part++, offset += JOIN_CHUNK_BYTES
              ) {
                const chunk = file.slice(offset, offset + JOIN_CHUNK_BYTES);
                setNotice(
                  `جارٍ رفع ${file.name} · ${Math.floor((sent * 100) / total)}%`,
                );
                if (!uploaded.has(`${index}:${part}`))
                  await uploadRequest(`chunk?file=${index}&part=${part}`, {
                    headers: {
                      ...headers,
                      "Content-Type": "application/octet-stream",
                    },
                    body: chunk,
                  });
                sent += chunk.size;
              }
            }
            setNotice("اكتمل رفع المرفقات، جارٍ إرسال الطلب…");
            await uploadRequest("complete", { headers });
          }
        }
        setNotice("تم توثيق رقمك وإرسال طلبك إلى إدارة الديوان للمراجعة.");
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
            minLength={5}
            maxLength={2000}
            placeholder="أخبرنا عن رغبتك في الانضمام وما يمكنك المشاركة به."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
          <label htmlFor="join-identity">صورة الهوية أو ملفها (اختياري)</label>
          <input
            id="join-identity"
            type="file"
            disabled={busy}
            aria-describedby={
              fileError ? "join-files-note join-files-error" : "join-files-note"
            }
            aria-invalid={!!fileError}
            onChange={(event) => chooseFiles("identity", event.currentTarget)}
          />
          <label htmlFor="join-experience">
            مرفقات الخبرات السابقة (اختياري)
          </label>
          <input
            id="join-experience"
            type="file"
            multiple
            disabled={busy}
            aria-describedby={
              fileError ? "join-files-note join-files-error" : "join-files-note"
            }
            aria-invalid={!!fileError}
            onChange={(event) => chooseFiles("experience", event.currentTarget)}
          />
          <small id="join-files-note">
            جميع الصيغ مقبولة: PDF، صور أو غيرها. حتى 6 ملفات، 100 ميغابايت
            للملف و300 ميغابايت إجمالًا. تُحفظ بالجودة الأصلية وتتاح لإدارة
            الديوان فقط، ويبدأ الرفع بعد التحقق من جوالك.
          </small>
          {fileError && (
            <p id="join-files-error" className="login-error" role="alert">
              {fileError}
            </p>
          )}
          {!!attachments.length && (
            <ul className="join-files" aria-label="المرفقات المختارة">
              {attachments.map((item, index) => (
                <li key={index}>
                  <span>{item.file.name}</span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`إزالة ${item.file.name}`}
                    onClick={() => {
                      setFileError("");
                      setAttachments((current) =>
                        current.filter((_, i) => i !== index),
                      );
                      const input = document.getElementById(
                        item.kind === "identity"
                          ? "join-identity"
                          : "join-experience",
                      ) as HTMLInputElement | null;
                      if (input) input.value = "";
                    }}
                  >
                    إزالة
                  </button>
                </li>
              ))}
            </ul>
          )}
          <details className="join-policy">
            <summary>{options.policy.title || "شروط وسياسة الانضمام"}</summary>
            <div>{options.policy.content}</div>
          </details>
          <label className="login-consent" htmlFor="join-attestation">
            <input
              id="join-attestation"
              type="checkbox"
              required
              checked={attestation}
              disabled={busy}
              onChange={(event) => setAttestation(event.target.checked)}
            />
            <span>{JOIN_ATTESTATION}</span>
          </label>
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
            <span>
              {attachments.length
                ? `${attachments.length} مرفقات سترفع مع الطلب بعد التحقق`
                : "بدون مرفقات"}
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
            disabled={busy || !!uploadToken}
            aria-describedby="join-code-note"
          />
          <small id="join-code-note">
            {uploadToken
              ? "تم التحقق من جوالك. إذا انقطع الرفع، اضغط استكمال الرفع خلال ساعة دون إغلاق الصفحة."
              : "أدخل الرمز المكوّن من 6 أرقام خلال 5 دقائق لإرسال طلبك."}
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
        disabled={busy || (!challenge && (!consent || !attestation))}
      >
        {busy
          ? "جارٍ التنفيذ…"
          : uploadToken
            ? "استكمال الرفع وإرسال الطلب"
            : challenge
              ? "تحقق وأرسل طلب الانضمام"
              : "إرسال رمز التحقق إلى واتساب"}
      </button>
      {challenge && (
        <div className="login-actions">
          <button
            type="button"
            disabled={busy || retry > 0 || !!uploadToken}
            onClick={() => void resend()}
          >
            {retry ? `إعادة الإرسال بعد ${retry} ثانية` : "إعادة إرسال الرمز"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setChallenge("");
              setUploadToken("");
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
