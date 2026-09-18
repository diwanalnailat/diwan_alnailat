/* Label output uses the saved asset identifier; it never allocates a new number. */
(function (root) {
  "use strict";
  const presets = {
    tze36: { name: "شريط 36 mm — ملصق 70 × 36", w: 70, h: 36 },
    tze24: { name: "شريط 24 mm — ملصق 70 × 24", w: 70, h: 24 },
    dk29: { name: "ملصق 62 × 29 mm", w: 62, h: 29 },
    standard: { name: "ملصق 50 × 30 mm", w: 50, h: 30 },
    a4: { name: "ورقة A4 للقص — 14 ملصقًا", w: 70, h: 36, sheet: true },
  };
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function layout(
    asset,
    key = "tze36",
    mode = "link",
    origin = root.location?.origin,
  ) {
    const p = presets[key];
    if (!p || !asset?.id || !asset.serial || !["link", "code"].includes(mode))
      throw Error("اختر أصلًا محفوظًا ومقاس ملصق صالحًا");
    const base = new URL(origin);
    if (!["https:", "http:"].includes(base.protocol))
      throw Error("رابط الديوان غير صالح");
    const payload =
      mode === "code"
        ? asset.serial
        : base.origin + "/#assets?asset=" + encodeURIComponent(asset.id);
    const q = root.qrcode(0, "M");
    q.addData(payload);
    q.make();
    const qr = Math.min(p.h - 8, 22),
      x = 3,
      y = (p.h - qr) / 2;
    return { ...p, q, payload, qr, x, y, left: x + qr + 3, right: p.w - 3 };
  }
  function lines(text, max, limit) {
    const out = [];
    let current = "";
    for (const word of String(text || "").split(/\s+/)) {
      if ((current ? current.length + 1 : 0) + word.length <= max)
        current += (current ? " " : "") + word;
      else {
        if (current) out.push(current);
        let rest = word;
        while (rest.length > max) {
          out.push(rest.slice(0, max));
          rest = rest.slice(max);
        }
        current = rest;
      }
    }
    if (current) out.push(current);
    if (out.length > limit) out[limit - 1] = out[limit - 1].slice(0, -1) + "…";
    return out.slice(0, limit);
  }
  function labelSVG(asset, key, mode, origin) {
    const a = layout(asset, key, mode, origin),
      n = a.q.getModuleCount(),
      cell = a.qr / (n + 8);
    let cells = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (a.q.isDark(r, c))
          cells += `<rect x="${a.x + (c + 4) * cell}" y="${a.y + (r + 4) * cell}" width="${cell}" height="${cell}"/>`;
    const width = a.right - a.left,
      name = lines(asset.name, Math.max(10, Math.floor(width / 1.3)), 2);
    const code = lines(asset.serial, Math.max(12, Math.floor(width / 1.35)), 3);
    const codeY = a.h < 27 ? 15 : 20;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}mm" height="${a.h}mm" viewBox="0 0 ${a.w} ${a.h}" role="img" aria-label="${esc(asset.serial)}"><rect width="${a.w}" height="${a.h}" fill="white"/><g fill="black" shape-rendering="crispEdges">${cells}</g><g fill="black" font-family="Tajawal,Arial,sans-serif"><text x="${a.right}" y="5.5" font-size="2.6" direction="rtl" text-anchor="start">ديوان النائلات</text>${name.map((v, i) => `<text x="${a.right}" y="${9.7 + i * 3.2}" font-size="3" direction="rtl" text-anchor="start">${esc(v)}</text>`).join("")}<g direction="ltr" font-family="monospace">${code.map((v, i) => `<text x="${a.left}" y="${codeY + i * 2.8}" font-size="2.2">${esc(v)}</text>`).join("")}</g>${a.h >= 29 ? `<text x="${a.right}" y="${a.h - 3}" font-size="2.2" direction="rtl" text-anchor="start">${asset.kind === "serialized" ? "قطعة مستقلة" : "سجل صنف بالكمية"}</text>` : ""}</g></svg>`;
  }
  let fontPromise;
  async function pdf(
    assets,
    key = "tze36",
    mode = "link",
    origin = root.location.origin,
  ) {
    if (!assets.length || assets.length > 200)
      throw Error("اختر من 1 إلى 200 ملصق في كل طباعة");
    fontPromise ||= fetch("/tajawal-pdf.ttf")
      .then((r) => {
        if (!r.ok) throw Error("تعذر تحميل خط الملصق");
        return r.arrayBuffer();
      })
      .then((b) => {
        let s = "";
        for (const c of new Uint8Array(b)) s += String.fromCharCode(c);
        return btoa(s);
      })
      .catch((e) => {
        fontPromise = null;
        throw e;
      });
    const font = await fontPromise,
      p = presets[key];
    if (!p) throw Error("مقاس غير صالح");
    const doc = new root.jspdf.jsPDF({
      unit: "mm",
      format: p.sheet ? "a4" : [p.w, p.h],
      orientation: p.sheet ? "portrait" : "landscape",
      compress: true,
    });
    doc.addFileToVFS("Tajawal.ttf", font);
    doc.addFont("Tajawal.ttf", "Tajawal", "normal");
    doc.setProperties({
      title: "ملصقات أصول ديوان النائلات",
      author: "ديوان النائلات",
    });
    const arabic = (v, x, y, size) => {
      doc.setFont("Tajawal");
      doc.setFontSize(size);
      doc.text(v, x, y, {
        align: "right",
        isInputVisual: false,
        isOutputVisual: true,
        isInputRtl: true,
        isOutputRtl: false,
      });
    };
    assets.forEach((asset, i) => {
      const j = p.sheet ? i % 14 : 0;
      if (i && (!p.sheet || !j))
        doc.addPage(
          p.sheet ? "a4" : [p.w, p.h],
          p.sheet ? "portrait" : "landscape",
        );
      const ox = p.sheet ? 30 + (j % 2) * 80 : 0,
        oy = p.sheet ? 12 + Math.floor(j / 2) * 39 : 0;
      const a = layout(asset, key, mode, origin),
        n = a.q.getModuleCount(),
        cell = a.qr / (n + 8);
      doc.setFillColor(0, 0, 0);
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (a.q.isDark(r, c))
            doc.rect(
              ox + a.x + (c + 4) * cell,
              oy + a.y + (r + 4) * cell,
              cell + 0.02,
              cell + 0.02,
              "F",
            );
      arabic("ديوان النائلات", ox + a.right, oy + 5.5, 7.4);
      const name = lines(
        asset.name,
        Math.max(10, Math.floor((a.right - a.left) / 1.3)),
        2,
      );
      name.forEach((v, k) => arabic(v, ox + a.right, oy + 9.7 + k * 3.2, 8.5));
      doc.setFont("courier");
      doc.setFontSize(6.2);
      const code = lines(
        asset.serial,
        Math.max(12, Math.floor((a.right - a.left) / 1.35)),
        3,
      );
      code.forEach((v, k) =>
        doc.text(v, ox + a.left, oy + (a.h < 27 ? 15 : 20) + k * 2.8),
      );
      if (a.h >= 29)
        arabic(
          asset.kind === "serialized" ? "قطعة مستقلة" : "سجل صنف بالكمية",
          ox + a.right,
          oy + a.h - 3,
          6.2,
        );
      if (p.sheet) {
        doc.setDrawColor(205);
        doc.setLineWidth(0.12);
        doc.rect(ox, oy, p.w, p.h);
      }
    });
    return doc.output("arraybuffer");
  }
  async function print(assets, key, mode) {
    if (!assets.length || assets.length > 200)
      throw Error("اختر من 1 إلى 200 ملصق");
    const p = presets[key],
      w = root.open("", "_blank");
    if (!w) throw Error("اسمح بفتح نافذة الطباعة أو نزّل PDF واطبعه");
    w.document.open();
    w.document.write(
      `<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>ملصقات الأصول</title><style>@font-face{font-family:Tajawal;src:url('${root.location.origin}/tajawal-pdf.ttf')}*{box-sizing:border-box}body{margin:0;background:#eee}.sheet{background:white;${p.sheet ? "width:210mm;min-height:297mm;padding:12mm 30mm;display:grid;grid-template-columns:70mm 70mm;grid-auto-rows:36mm;column-gap:10mm;row-gap:3mm" : "width:" + p.w + "mm"}}.label{width:${p.w}mm;height:${p.h}mm;break-inside:avoid;${p.sheet ? "outline:0.1mm solid #ccc" : "break-after:page"}}svg{display:block}p{font:16px Arial;margin:20px}@page{size:${p.sheet ? "A4" : p.w + "mm " + p.h + "mm"};margin:0}@media print{body{background:white}p{display:none}.sheet{break-after:page}}</style></head><body><p>اختر مقاس الورق المطابق و100% دون تحجيم. للطباعة اضغط Ctrl+P أو ⌘P.</p>${assets.map((a, i) => `${(p.sheet ? i % 14 === 0 : i === 0) ? '<div class="sheet">' : ""}<div class="label">${labelSVG(a, key, mode, root.location.origin)}</div>${(p.sheet ? i % 14 === 13 || i === assets.length - 1 : i === assets.length - 1) ? "</div>" : ""}`).join("")}</body></html>`,
    );
    w.document.close();
    if (w.document.fonts?.ready) await w.document.fonts.ready;
    w.focus();
    w.print();
  }
  root.DiwanLabels = { presets, layout, labelSVG, pdf, print };
})(typeof window === "undefined" ? globalThis : window);
