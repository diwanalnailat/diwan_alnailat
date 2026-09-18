# صفحة النائلات في Next.js

بتاريخ 2026-09-18 نُقلت الصفحة التعريفية إلى Next.js App Router وReact وTypeScript، بناءً على طلب تحويل `/#heritage`. لم تُنقل مساحة العمل كاملة أو قاعدة بيانات الإنتاج.

## التشغيل

استخدم Node.js 22.22.2 أو أحدث:

```sh
npm ci
npm run dev
```

على الجهاز الحالي يمكن التشغيل دون تغيير إصدار Node المثبت:

```sh
npx --yes --package=node@22 node scripts/dev-next.mjs
```

- صفحة React: `http://127.0.0.1:4173/heritage`.
- الرابط القديم `/#heritage` و`/index.html` يحوّلان إلى صفحة Next.
- مساحة العمل الحالية: `http://127.0.0.1:4173/workspace#overview`.
- يشغّل أمر التطوير Next على 4173 وWorker المحلي على 4174؛ كلاهما على loopback فقط. تحتفظ قاعدة SQLite المحلية بمسارها وبياناتها السابقة.

## الملفات

- `app/heritage/page.tsx`: نقطة دخول الصفحة، مكوّن خادم.
- `components/heritage/heritage-page.tsx`: أقسام الصفحة بمكوّنات React، دون حقن HTML أو تشغيل `public/app.js` داخل صفحة Next.
- `components/heritage/season-tabs.tsx`: اختيار الموسم وتنقل لوحة المفاتيح باتجاه RTL.
- `components/heritage/reveal.tsx`: حركة الظهور مع تنظيف المراقبين واحترام تقليل الحركة.
- `lib/heritage/content.ts` و`types.ts`: بيانات المواسم الموثقة نفسها وعقدها؛ تُستبدل دالة القراءة بمستودع قاعدة البيانات عند الربط لاحقًا. لا يوجد ربط جديد أو بيانات مزود وهمية.
- الأصول والخطوط وCSS الأصلية مشتركة؛ `app/globals.css` يحوي إضافات الوصول وتصحيح تباين النصوص الصغيرة.
- `public/index.html` و`public/app.js` باقيا لمساحة العمل القديمة فقط. صفحة `/heritage` مستقلة عنهما.

## البناء والتحقق

```sh
npm test
npm run test:heritage
npm run lint
npm run typecheck
npm run build
```

اختبارات المتصفح تحتاج خادمي التطوير قيد التشغيل وGoogle Chrome مثبتًا. تفحص العرض على الكمبيوتر والجوال، المواسم، لوحة المفاتيح، تقليل الحركة، الوصول باستخدام axe، العرض دون JavaScript، والدخول وطلب الانضمام.

`npm run build` يُنتج إصدار Worker السابق (`generated.js` و`dist/`) ثم إصدار Next (`.next/`). `npm start` يشغّل إصدار Next المبني على loopback. `npm run dev:legacy` و`npm run build:legacy` يبقيان متاحين للعمل على Worker بصورة منفصلة.

## حدود النقل والنشر

ربط `/workspace` و`/api` بالخادم المحلي مفعّل في التطوير فقط. لا يمرّر بناء Next للإنتاج الطلبات إلى هوية المطور، ولا يثق برؤوس هوية Sites على استضافة جديدة. صفحة مساحة العمل في بناء Next للإنتاج تعرض توجيهًا لاستخدام رابط الديوان الخاص؛ تفعيلها على الاستضافة الجديدة يحتاج تصميم الجلسات والتكامل مع الخلفية أولًا.

لم تتغير الترحيلات أو صلاحيات D1/R2 أو جمهور Site، ولم يُنشر شيء. استُعيد ملف `.openai/hosting.json` من المجلد الفرعي نفسه دون تغيير معرف المشروع. الانتقال إلى استضافة Next جديدة يتطلب حفظ خصوصية الموقع وربط هوية موثوقة قبل إتاحة المنصة؛ `noindex` ليس تحكمًا في الوصول.

مراجع التنفيذ: [مكوّنات الخادم والعميل](https://nextjs.org/docs/app/getting-started/server-and-client-components)، [إعادة توجيه الطلبات داخليًا](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites). تمت مراجعة الوثائق المرفقة مع Next 16.3.5 أيضًا.
