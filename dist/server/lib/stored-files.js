import { boundedBody } from "./security.js";

export const WORKSPACE_FILE_MAX_BYTES = 10 * 1024 * 1024;
const digest = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");

// Called only after authorization, original size and MIME/signature validation.
// Storage metadata is server-generated, never taken from upload form fields.
export async function encodeStoredFile(input) {
  const original = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!original.length || original.length > WORKSPACE_FILE_MAX_BYTES)
    throw new Error("Invalid file size");
  const compressed = new Uint8Array(
    await new Response(
      new Blob([original]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const smaller = compressed.length < original.length;
  const bytes = smaller ? compressed : original;
  return {
    bytes,
    storage: {
      version: 1,
      encoding: smaller ? "gzip" : "raw",
      stored_size: bytes.length,
      sha256: await digest(original),
    },
  };
}

function storageMetadata(file) {
  const storage = JSON.parse(file.meta || "{}").storage;
  if (
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > WORKSPACE_FILE_MAX_BYTES
  )
    throw new Error("Invalid file size");
  if (
    storage !== undefined &&
    (!storage ||
      storage.version !== 1 ||
      !["raw", "gzip"].includes(storage.encoding) ||
      !Number.isSafeInteger(storage.stored_size) ||
      storage.stored_size <= 0 ||
      storage.stored_size > file.size ||
      (storage.encoding === "raw" && storage.stored_size !== file.size) ||
      !/^[a-f0-9]{64}$/.test(storage.sha256))
  )
    throw new Error("Invalid file storage metadata");
  return storage;
}

async function decodeStoredFile(file, object, storage, signal) {
  const source = new Response(object.body).body;
  if (signal?.aborted) {
    await source.cancel();
    throw signal.reason;
  }
  let storedSize = 0;
  const boundedSource = source.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        storedSize += chunk.byteLength;
        if (storedSize > (storage?.stored_size ?? file.size))
          throw new Error("Stored file exceeds declared size");
        controller.enqueue(chunk);
      },
      flush() {
        if (storedSize !== (storage?.stored_size ?? file.size))
          throw new Error("Stored file size mismatch");
      },
    }),
    { signal },
  );
  const bytes = await boundedBody(
    {
      headers: new Headers(),
      body:
        storage?.encoding === "gzip"
          ? boundedSource.pipeThrough(new DecompressionStream("gzip"), {
              signal,
            })
          : boundedSource,
    },
    file.size,
  );
  if (
    bytes.length !== file.size ||
    (storage && (await digest(bytes)) !== storage.sha256)
  )
    throw new Error("Stored file integrity mismatch");
  return bytes;
}

export async function storedFileBytes(file, object) {
  return decodeStoredFile(file, object, storageMetadata(file));
}

export function storedFileStream(file, object) {
  const storage = storageMetadata(file),
    abort = new AbortController();
  let started = false;
  // WebCrypto validates the whole original before exposing any bytes. The
  // buffer stays within the original 10 MiB contract, never archive expansion.
  return new ReadableStream(
    {
      async pull(controller) {
        if (started) return;
        started = true;
        try {
          const bytes = await decodeStoredFile(
            file,
            object,
            storage,
            abort.signal,
          );
          if (!abort.signal.aborted) {
            controller.enqueue(bytes);
            controller.close();
          }
        } catch (error) {
          if (!abort.signal.aborted) controller.error(error);
        }
      },
      async cancel() {
        abort.abort();
        if (!started) await new Response(object.body).body.cancel();
      },
    },
    { highWaterMark: 0 },
  );
}
