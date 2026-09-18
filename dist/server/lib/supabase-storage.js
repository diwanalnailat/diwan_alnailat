// Private server-side Storage access. The Worker authorizes each file operation.
export function supabaseStorage(env, request = fetch) {
  const url = new URL(env.SUPABASE_URL);
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET || "diwan-files";
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
    url.username ||
    url.password ||
    !key ||
    !/^[a-z0-9-]+$/.test(bucket)
  )
    throw new Error("Invalid server Storage configuration");
  const headers = {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  };
  async function call(path, options = {}) {
    return request(`${url.origin}/storage/v1/${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  }
  async function check(response) {
    if (!response.ok)
      throw new Error(`Supabase Storage request failed (${response.status})`);
    return response;
  }
  const objectPath = (objectKey) => {
    if (!/^files\/[a-zA-Z0-9-]+$/.test(objectKey))
      throw new Error("Invalid object key");
    return `object/${bucket}/${objectKey}`;
  };
  return {
    bucket,
    async inspect() {
      const response = await call(`bucket/${bucket}`);
      const value = await response.json();
      if (response.status === 404 || String(value.statusCode) === "404")
        return null;
      await check(response);
      if (value.public !== false)
        throw new Error("Diwan requires a private Storage bucket");
      return {
        id: value.id,
        public: false,
        fileSizeLimit: value.file_size_limit,
      };
    },
    async create() {
      await check(
        await call("bucket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: bucket,
            name: bucket,
            public: false,
            file_size_limit: 10485760,
            allowed_mime_types: [
              "image/*",
              "audio/*",
              "video/mp4",
              "application/pdf",
              "text/plain",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ],
          }),
        }),
      );
    },
    async put(objectKey, bytes, options = {}) {
      if (bytes.byteLength > 10485760)
        throw new Error("File exceeds Storage limit");
      await check(
        await call(objectPath(objectKey), {
          method: "POST",
          headers: {
            "Content-Type":
              options.httpMetadata?.contentType || "application/octet-stream",
            "x-upsert": "false",
          },
          body: bytes,
        }),
      );
    },
    async get(objectKey) {
      const response = await call(objectPath(objectKey));
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 404 || String(error.statusCode) === "404")
          return null;
        await check(response);
      }
      return { body: response.body, arrayBuffer: () => response.arrayBuffer() };
    },
    async delete(objectKey) {
      objectPath(objectKey);
      await check(
        await call(`object/${bucket}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: [objectKey] }),
        }),
      );
    },
  };
}
