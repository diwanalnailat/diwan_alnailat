// Test fixtures only. Does not access or modify live asset records.
import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode-generator";
import { jsPDF } from "jspdf";
import "../public/asset-labels.js";
const out = path.resolve(process.argv[2] || "/tmp/diwan-label-check");
fs.mkdirSync(out, { recursive: true });
globalThis.qrcode = qrcode;
globalThis.jspdf = { jsPDF };
globalThis.fetch = async () =>
  new Response(fs.readFileSync("public/tajawal-pdf.ttf"));
const origin = "https://diwan-almazayen.azoooz5103.chatgpt.site";
const asset = {
  id: "32ef97c6-f3ea-4d27-af0a-a9eef3dacdb8",
  serial: "NL-00000001",
  name: "درع تكريم ضيوف المشاركة",
  kind: "serialized",
};
for (const size of Object.keys(DiwanLabels.presets)) {
  const mode = size === "tze24" ? "code" : "link";
  const records =
    size === "a4"
      ? Array.from({ length: 15 }, (_, i) => ({
          ...asset,
          id: `32ef97c6-f3ea-4d27-af0a-${String(i + 1).padStart(12, "0")}`,
          serial: `NL-${String(i + 1).padStart(8, "0")}`,
        }))
      : [asset];
  fs.writeFileSync(
    path.join(out, size + ".pdf"),
    Buffer.from(await DiwanLabels.pdf(records, size, mode, origin)),
  );
  fs.writeFileSync(
    path.join(out, size + ".svg"),
    DiwanLabels.labelSVG(asset, size, mode, origin),
  );
}
console.log(out);
