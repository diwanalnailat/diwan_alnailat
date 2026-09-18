// Shared request boundaries. Never rely on Content-Length supplied by a client.
export async function boundedBody(req, max) {
  if (Number(req.headers.get("content-length")) > max)
    throw Object.assign(new Error("الطلب أكبر من الحد المسموح"), {
      status: 413,
    });
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader(),
    parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw Object.assign(new Error("الطلب أكبر من الحد المسموح"), {
          status: 413,
        });
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return body;
}
export async function jsonBody(req, max = 1048576) {
  let result;
  try {
    result = JSON.parse(new TextDecoder().decode(await boundedBody(req, max)));
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("تعذر قراءة الطلب"), { status: 400 });
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw Object.assign(new Error("أرسل حقول الطلب بصورة صحيحة"), {
      status: 400,
    });
  return result;
}
export async function formBody(req) {
  const bytes = await boundedBody(req, 12 * 1024 * 1024);
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw Object.assign(new Error("تعذر قراءة المرفق"), { status: 400 });
  }
}
export function httpsOrigin(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash
      ? u.origin
      : null;
  } catch {
    return null;
  }
}
