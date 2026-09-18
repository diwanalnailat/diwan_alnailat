// Server-only Green API transport. Never return or log credential-bearing URLs.
export function greenConfigured(env) {
  return (
    /^https:\/\/\d+\.api\.greenapi\.com$/.test(env.GREEN_API_URL || "") &&
    /^\d+$/.test(env.GREEN_API_INSTANCE || "") &&
    /^[a-zA-Z0-9_-]{20,}$/.test(env.GREEN_API_TOKEN || "")
  );
}

export async function greenRequest(env, method, body) {
  if (
    !greenConfigured(env) ||
    !["getStateInstance", "getSettings", "sendMessage"].includes(method)
  )
    throw Object.assign(new Error("إعدادات Green API غير مكتملة."), {
      status: 503,
    });
  let response;
  try {
    response = await (env.PROVIDER_FETCH || fetch)(
      `${env.GREEN_API_URL}/waInstance${env.GREEN_API_INSTANCE}/${method}/${env.GREEN_API_TOKEN}`,
      {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch {
    throw Object.assign(new Error("تعذر تأكيد استجابة Green API."), {
      status: 502,
    });
  }
  if (!response.ok)
    throw Object.assign(new Error("رفض Green API الطلب."), {
      status: 502,
      retryable: response.status === 429,
    });
  try {
    return await response.json();
  } catch {
    throw Object.assign(new Error("استجابة Green API غير صالحة."), {
      status: 502,
    });
  }
}

export async function greenWhatsApp(env, phone, parameters, otp) {
  const number = String(phone).replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(number))
    throw Object.assign(new Error("رقم الجوال غير صالح."), { status: 400 });
  const message = otp
    ? `رمز التحقق لديوان النائلات: ${String(parameters[0])}\nلا تشارك الرمز مع أحد.`
    : `ديوان النائلات\n${String(parameters[0])}\n${String(parameters[1])}\n${String(parameters[2])}`;
  const result = await greenRequest(env, "sendMessage", {
    chatId: `${number}@c.us`,
    message,
    linkPreview: false,
  });
  if (typeof result.idMessage !== "string" || !result.idMessage)
    throw Object.assign(new Error("لم يؤكد Green API قبول الرسالة."), {
      status: 502,
    });
  return result.idMessage;
}
