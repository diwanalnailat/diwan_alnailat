/* Branded exports, generated entirely from authorized server responses. */
(function (root) {
  "use strict";
  const xml = (v) =>
    String(v ?? "")
      .replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[c],
      )
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const enc = new TextEncoder(),
    te = (s) => enc.encode(s),
    col = (n) => {
      let out = "";
      for (n++; n; n = Math.floor((n - 1) / 26))
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
      return out;
    };
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const local = [],
      central = [];
    let offset = 0;
    for (const [name, value] of Object.entries(files)) {
      const n = te(name),
        bytes = typeof value === "string" ? te(value) : value,
        crc = crc32(bytes),
        h = new Uint8Array(30 + n.length),
        v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 0x800, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, bytes.length, true);
      v.setUint32(22, bytes.length, true);
      v.setUint16(26, n.length, true);
      h.set(n, 30);
      local.push(h, bytes);
      const c = new Uint8Array(46 + n.length),
        cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x800, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, bytes.length, true);
      cv.setUint32(24, bytes.length, true);
      cv.setUint16(28, n.length, true);
      cv.setUint32(42, offset, true);
      c.set(n, 46);
      central.push(c);
      offset += h.length + bytes.length;
    }
    const size = central.reduce((s, x) => s + x.length, 0),
      end = new Uint8Array(22),
      ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red](#,##0.00)"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Tajawal"/><color rgb="FF252723"/></font><font><b/><sz val="19"/><name val="Tajawal"/><color rgb="FF252723"/></font><font><b/><sz val="11"/><name val="Tajawal"/><color rgb="FFFFFFFF"/></font><font><sz val="10"/><name val="Tajawal"/><color rgb="FF74786E"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF242622"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0EAE1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="hair"><color rgb="FFE5E7E1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  function cell(value, i, row, type = "text", style = 0) {
    const ref = col(i) + row;
    if (value === undefined || value === null)
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>—</t></is></c>`;
    if (type === "money" && typeof value === "number")
      return `<c r="${ref}" s="${style === 6 ? 7 : 3}"><v>${value / 100}</v></c>`;
    if (type === "number" && typeof value === "number")
      return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    if (type === "date" && value) {
      const d = Date.parse(String(value).slice(0, 10) + "T00:00:00Z");
      if (Number.isFinite(d))
        return `<c r="${ref}" s="4"><v>${Math.round(d / 86400000) + 25569}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }
  function sheet(title, columns, rows, asOf, subtitle = "") {
    const last = col(columns.length - 1),
      n = rows.length + 5;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${n}"/><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="27"/><cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 22}" customWidth="1"/>`).join("")}</cols><sheetData><row r="1" ht="42" customHeight="1">${columns.map((_, i) => cell(i === 0 ? "ديوان النائلات | " + title : "", i, 1, "text", 1)).join("")}</row><row r="2" ht="28" customHeight="1">${cell("تاريخ الاستخراج: " + String(asOf).slice(0, 19).replace("T", " ") + " UTC", 0, 2, "text", 5)}</row><row r="3" ht="28" customHeight="1">${cell(subtitle || "بيانات السجلات المتاحة حسب صلاحية المستخدم. جميع المبالغ بالريال السعودي.", 0, 3, "text", 5)}</row><row r="4" ht="10" customHeight="1"/><row r="5" ht="32" customHeight="1">${columns.map((c, i) => cell(c.label, i, 5, "text", 2)).join("")}</row>${rows.map((r, k) => `<row r="${k + 6}" ht="32" customHeight="1">${columns.map((c, i) => cell(typeof c.get === "function" ? c.get(r) : r[c.key], i, k + 6, c.type, k % 2 ? 6 : 0)).join("")}</row>`).join("")}</sheetData><autoFilter ref="A5:${last}${Math.max(5, n)}"/><mergeCells count="3"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/><mergeCell ref="A3:${last}3"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  function workbook(data) {
    const { type, rows, settings, as_of } = data,
      pname = (id) =>
        data.projects.find((x) => x.id === id)?.title || "غير متاح",
      uname = (id) => data.people.find((x) => x.id === id)?.name || "غير مسندة",
      supplier = (id) =>
        data.suppliers.find((x) => x.id === id)?.name || "غير محدد",
      C = (label, key, type = "text", width = 22) => ({
        label,
        key,
        type,
        width,
      }),
      P = { label: "المشروع", get: (r) => pname(r.project_id), width: 28 };
    const types = {
      tasks: "تقرير المهام",
      expenses: "تقرير المصاريف",
      advances: "تقرير العهد المالية",
      projects: "تقرير المشاريع",
      assets: "تقرير الأصول",
      suppliers: "دليل الموردين",
      media: "أرشيف العلاقات الإعلامية",
      audit: "سجل العمليات",
    };
    let columns = [];
    if (type === "media")
      columns = [
        C("الاسم", "name"),
        C("الصفة", "role"),
        C("الجوال", "phone"),
        C("الحسابات وتاريخ الرصد", "accounts", "text", 60),
        P,
        C("تاريخ المشاركة", "date", "date"),
        C("العمل", "title"),
        C("التفاصيل", "description", "text", 50),
        C("المنصة", "platform"),
        C("رابط العمل", "url", "text", 50),
        C("الحالة", "status"),
        C("المتابعون وقت المشاركة", "followers", "number"),
        C("المشاهدات", "views", "number"),
        C("التفاعلات", "interactions", "number"),
        C("تقييم التعاون والملاحظات", "notes", "text", 50),
      ];
    else if (type === "advances")
      columns = [
        C("العهدة", "title", "text", 30),
        P,
        { label: "العضو", get: (r) => uname(r.assignee_id) },
        ...[
          ["funded", "التمويل"],
          ["settled", "المسوّى"],
          ["returned", "المسترد"],
          ["balance", "الرصيد"],
        ].map(([key, label]) => ({
          label,
          get: (r) => r[key],
          type: "money",
        })),
      ];
    else if (type === "tasks")
      columns = [
        C("المهمة", "title", "text", 38),
        P,
        {
          label: "اللجنة",
          get: (r) =>
            data.committees?.find((c) => c.id === r.meta?.committee_id)?.name ||
            "عامة",
        },
        { label: "المسؤول", get: (r) => uname(r.assignee_id) },
        {
          label: "الحالة",
          get: (r) =>
            (
              data.committees?.find((c) => c.id === r.meta?.committee_id)
                ?.statuses || settings.taskStatuses
            ).find((x) => x.id === r.status)?.name || r.status,
        },
        {
          label: "الأولوية",
          get: (r) =>
            settings.priorities.find((x) => x.id === r.priority)?.name ||
            r.priority,
        },
        C("تاريخ البداية", "start", "date"),
        C("تاريخ الاستحقاق", "due", "date"),
        { label: "مسار العمل", get: (r) => r.meta.section || "" },
        {
          label: "خطوات مكتملة",
          type: "number",
          get: (r) => r.meta.checklist?.filter((x) => x.done).length || 0,
        },
        {
          label: "إجمالي الخطوات",
          type: "number",
          get: (r) => r.meta.checklist?.length || 0,
        },
        C("الوصف", "description", "text", 55),
        ...settings.customFields.map((f) => ({
          label: f.name,
          type:
            f.type === "number"
              ? "number"
              : f.type === "date"
                ? "date"
                : "text",
          get: (r) =>
            f.type === "number" &&
            r.meta.custom?.[f.id] !== undefined &&
            r.meta.custom?.[f.id] !== ""
              ? Number(r.meta.custom[f.id])
              : r.meta.custom?.[f.id],
        })),
      ];
    else if (type === "expenses")
      columns = [
        C("المصروف", "title", "text", 38),
        P,
        { label: "المورد", get: (r) => supplier(r.supplier_id) },
        C("رقم الفاتورة", "number"),
        C("التصنيف", "category"),
        C("التاريخ", "date", "date"),
        C("الإجمالي شامل الضريبة", "amount", "money"),
        C("الضريبة ضمن الإجمالي", "tax", "money"),
        {
          label: "الحالة",
          get: (r) =>
            ({
              draft: "مسودة",
              pending: "بانتظار الاعتماد",
              approved: "معتمد",
              returned: "معاد للتعديل",
            })[r.status],
        },
        C("المسدد", "paid", "money"),
        {
          label: "المتبقي",
          type: "money",
          get: (r) => (r.amount_hidden ? undefined : r.amount - r.paid),
        },
        { label: "الملاحظات", get: (r) => r.meta.notes || "", width: 40 },
      ];
    else if (type === "projects")
      columns = [
        C("المشروع", "title", "text", 38),
        C("الموسم", "season"),
        {
          label: "الحالة",
          get: (r) =>
            ({
              active: "نشط",
              planned: "مخطط",
              onhold: "متوقف",
              closed: "مغلق",
            })[r.status],
        },
        C("البداية", "start", "date"),
        C("النهاية", "due", "date"),
        C("الميزانية", "budget", "money"),
        C("الوصف", "description", "text", 55),
      ];
    else if (type === "assets")
      columns = [
        C("الأصل", "name", "text", 35),
        {
          label: "نوع التتبع",
          get: (r) =>
            ({ quantity: "بالكمية", serialized: "مرقم", consumable: "مستهلك" })[
              r.kind
            ],
        },
        {
          label: "الملكية",
          get: (r) =>
            ({ owned: "مملوك", rented: "مستأجر", borrowed: "مستعار" })[
              r.ownership
            ],
        },
        C("التصنيف", "category"),
        C("الكمية", "quantity", "number"),
        C("المتاح", "available", "number"),
        C("في العهدة", "issued", "number"),
        C("المستهلك", "consumed", "number"),
        C("الموقع", "location"),
        C("الرقم التسلسلي", "serial"),
        {
          label: "الحالة",
          get: (r) =>
            ({ ready: "جاهز", maintenance: "صيانة", damaged: "تالف" })[
              r.condition
            ],
        },
      ];
    else if (type === "suppliers")
      columns = [
        C("المورد", "name", "text", 35),
        C("التخصص", "category"),
        C("الجوال", "phone"),
        C("البريد", "email", "text", 35),
        C("الرقم الضريبي", "tax_number"),
        C("الملاحظات", "notes", "text", 45),
      ];
    else
      columns = [
        C("الإجراء", "action", "text", 35),
        C("القسم", "resource"),
        { label: "العضو", get: (r) => uname(r.actor) },
        C("التاريخ", "created"),
        C("معرف السجل", "entity_id", "text", 38),
      ];
    if (type === "expenses")
      columns.push(
        {
          label: "اللجنة",
          get: (r) =>
            data.committees?.find((c) => c.id === r.meta?.committee_id)?.name ||
            "سجل سابق",
        },
        {
          label: "بند الصرف",
          get: (r) => r.meta?.budget_line_name || r.category,
        },
        {
          label: "مصدر الدفع",
          get: (r) =>
            ({
              personal: "مال العضو الخاص",
              advance: "عهدة مالية",
              direct: "دفع الجهة",
              unpaid: "لم يدفع بعد",
            })[r.meta?.funding_source] || "سجل سابق",
        },
        {
          label: "صاحب المستحق",
          get: (r) => uname(r.meta?.claimant_id || r.created_by),
        },
        { label: "المعتمد الأول", get: (r) => uname(r.meta?.route?.[0]) },
        { label: "المعتمد الثاني", get: (r) => uname(r.meta?.route?.[1]) },
      );
    if (["assets", "tasks", "projects", "suppliers"].includes(type))
      columns.push(
        { label: "اسم الموقع", get: (r) => r.meta?.site_location?.label || "" },
        {
          label: "خط العرض",
          get: (r) => r.meta?.site_location?.lat ?? "",
          type: "number",
        },
        {
          label: "خط الطول",
          get: (r) => r.meta?.site_location?.lng ?? "",
          type: "number",
        },
        {
          label: "إرشادات الوصول",
          get: (r) => r.meta?.site_location?.notes || "",
        },
      );
    if (type === "assets")
      columns.push(
        {
          label: "رقم الشركة المصنعة",
          get: (r) => r.meta?.manufacturer_serial || "",
        },
        { label: "العلامة التجارية", get: (r) => r.meta?.brand || "" },
        { label: "نهاية الضمان", get: (r) => r.meta?.warranty_end || "" },
      );
    const sheets = [
      {
        name: "الملخص",
        cols: [
          C("المؤشر", "label", "text", 40),
          C("القيمة", "value", "number", 30),
          C("ملاحظة", "note", "text", 60),
        ],
        rows: [
          {
            label: "عدد السجلات",
            value: rows.length,
            note: "بعد الصلاحيات والتصفية",
          },
          { label: "نوع التقرير", value: types[type], note: "ديوان النائلات" },
          { label: "تاريخ الاستخراج", value: as_of, note: "UTC" },
        ],
      },
      { name: "التفاصيل", cols: columns, rows },
    ];
    if (type === "advances") {
      const balances = new Map();
      const entries = (data.advanceEntries || []).map((e) => {
        const balance =
          (balances.get(e.advance_id) || 0) +
          (e.type === "fund" ? e.amount : -e.amount);
        balances.set(e.advance_id, balance);
        return { ...e, running_balance: balance };
      });
      sheets.push({
        name: "حركات العهد",
        cols: [
          {
            label: "العهدة",
            get: (e) => rows.find((a) => a.id === e.advance_id)?.title || "",
            width: 30,
          },
          C("التاريخ", "date", "date"),
          {
            label: "الحركة",
            get: (e) =>
              ({
                fund: "تسليم / تعزيز",
                return: "استرداد",
                settlement: "تصفية مصروف معتمد",
              })[e.type],
          },
          C("المبلغ", "amount", "money"),
          C("الرصيد بعد الحركة", "running_balance", "money"),
          C("المرجع", "reference", "text", 40),
          { label: "وثقه", get: (e) => uname(e.created_by) },
          C("معرف الدفعة", "payment_id"),
        ],
        rows: entries,
      });
      sheets.push({
        name: "المصاريف المرتبطة",
        cols: [
          C("المصروف", "title", "text", 35),
          {
            label: "البند",
            get: (e) => e.meta?.budget_line_name || e.category,
          },
          {
            label: "الحالة",
            get: (e) =>
              ({
                pending: "بانتظار الاعتماد",
                approved: "معتمد",
                returned: "معاد للاستكمال",
                draft: "مسودة",
              })[e.status],
          },
          C("الإجمالي", "amount", "money"),
          {
            label: "الاعتماد الأول",
            get: (e) =>
              uname(
                e.meta?.approvals?.find((a) => a.decision === "approve")
                  ?.member_id,
              ),
          },
          {
            label: "الاعتماد الثاني",
            get: (e) =>
              uname(
                e.meta?.approvals?.filter((a) => a.decision === "approve")[1]
                  ?.member_id,
              ),
          },
        ],
        rows: data.linkedExpenses || [],
      });
    }
    if (type === "expenses") {
      const hidden = rows.some((r) => r.amount_hidden),
        approved = rows.filter((r) => r.status === "approved");
      for (const [label, get] of [
        ["المصاريف المعتمدة", (r) => r.amount],
        ["المسدد", (r) => r.paid],
        ["المتبقي المعتمد", (r) => r.amount - r.paid],
      ])
        sheets[0].rows.push({
          label,
          value: hidden
            ? "محجوب"
            : approved.reduce((s, r) => s + get(r), 0) / 100,
          note: "ريال سعودي · المصاريف المعتمدة فقط",
        });
      sheets.push({
        name: "الدفعات",
        cols: [
          {
            label: "المصروف",
            get: (r) => rows.find((e) => e.id === r.expense_id)?.title || "",
            width: 38,
          },
          C("المبلغ", "amount", "money"),
          C("التاريخ", "date", "date"),
          C("المرجع", "reference"),
          { label: "سجله", get: (r) => uname(r.created_by) },
        ],
        rows: data.payments || [],
      });
    }
    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
      "_rels/.rels":
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      "xl/styles.xml": styles,
    };
    sheets.forEach(
      (s, i) =>
        (files[`xl/worksheets/sheet${i + 1}.xml`] = sheet(
          types[type] + " | " + s.name,
          s.cols,
          s.rows,
          as_of,
        )),
    );
    return zip(files);
  }
  let fontPromise, markPromise;
  async function guidePDF(g, state) {
    if (!root.jspdf?.jsPDF) throw Error("تعذر تحميل أداة PDF. أعد فتح الصفحة.");
    fontPromise ||= fetch("/tajawal-pdf.ttf")
      .then((r) => {
        if (!r.ok) throw Error("تعذر تحميل الخط");
        return r.arrayBuffer();
      })
      .then((buf) => {
        let s = "";
        for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
        return btoa(s);
      });
    markPromise ||= fetch("/nailat-mark.png").then((r) => r.arrayBuffer());
    const [font, mark] = await Promise.all([fontPromise, markPromise]);
    const doc = new root.jspdf.jsPDF({
      unit: "mm",
      format: "a4",
      compress: true,
    });
    doc.addFileToVFS("Tajawal.ttf", font);
    doc.addFont("Tajawal.ttf", "Tajawal", "normal");
    doc.setFont("Tajawal");
    doc.setR2L(false);
    doc.setProperties({
      title: g.title,
      subject: "مسودة دليل تنفيذ مهمة",
      author: "ديوان النائلات",
      creator: "Diwan Al Nailat",
    });
    let y = 0;
    const project =
        state.projects.find((p) => p.id === g.project_id)?.title || "",
      member =
        state.people.find((p) => p.id === g.content.assignee_id)?.name ||
        "غير مسندة";
    const text = (s, x, yy, size = 11, color = [42, 44, 40]) => {
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.text(String(s), x, yy, {
        align: "right",
        isInputVisual: false,
        isOutputVisual: true,
        isInputRtl: true,
        isOutputRtl: false,
      });
    };
    const header = () => {
      doc.setFillColor(242, 237, 229);
      doc.rect(0, 0, 210, 36, "F");
      doc.addImage(new Uint8Array(mark), "PNG", 174, 8, 20, 17.54);
      text("ديوان النائلات", 165, 17, 17);
      text("أصالة الانتماء، وإتقان العمل", 165, 26, 10, [100, 101, 93]);
      doc.setDrawColor(202, 183, 153);
      doc.line(17, 39, 193, 39);
      y = 49;
    };
    header();
    function space(height) {
      if (y + height > 270) {
        doc.addPage();
        header();
      }
    }
    function paragraph(value, size = 11) {
      doc.setFontSize(size);
      const paragraphs = String(value || "لم يُستكمل بعد").split("\n");
      for (const p of paragraphs) {
        const lines = doc.splitTextToSize(p || " ", 173);
        for (const line of lines) {
          space(6.5);
          text(line, 193, y, size);
          y += 6.5;
        }
      }
    }
    text("مسودة للمراجعة", 193, y, 10, [149, 102, 43]);
    y += 10;
    paragraph(g.title, 19);
    y += 3;
    doc.setFillColor(248, 248, 245);
    const boxY = y;
    doc.roundedRect(17, boxY, 176, 29, 2, 2, "F");
    text("المشروع: " + project, 188, y + 8, 10);
    text("المسؤول: " + member, 188, y + 16, 10);
    text(
      "الاستحقاق: " +
        (g.content.due || "لم يحدد") +
        "  |  إصدار القالب: " +
        (g.template_version || state.settings.guideTemplate.version),
      188,
      y + 24,
      10,
    );
    y += 39;
    for (let i = 0; i < g.content.sections.length; i++) {
      const s = g.content.sections[i];
      space(24);
      doc.setFillColor(233, 225, 213);
      doc.rect(17, y - 5, 176, 10, "F");
      text(i + 1 + " . " + s.title, 190, y + 1, 12);
      y += 13;
      paragraph(s.body);
      y += 7;
    }
    space(15);
    doc.setDrawColor(223, 224, 216);
    doc.line(17, y, 193, y);
    y += 8;
    text(
      "يُراجع المحتوى وتُستكمل التفاصيل قبل اعتماد التنفيذ.",
      193,
      y,
      9,
      [108, 110, 101],
    );
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(223, 224, 216);
      doc.line(17, 281, 193, 281);
      text("ديوان النائلات | دليل مهمة | مسودة", 193, 288, 9, [116, 118, 109]);
      text("صفحة " + i + " من " + total, 50, 288, 9, [116, 118, 109]);
    }
    return doc.output("blob");
  }
  function download(blob, name) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name.replace(/[\\/:*?"<>|]/g, "-");
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  root.DiwanExports = { workbook, guidePDF, download };
})(typeof window === "undefined" ? globalThis : window);
