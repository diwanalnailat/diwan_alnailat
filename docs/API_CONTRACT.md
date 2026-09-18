# عقد واجهات الديوان

هذا دليل للمسارات الموجودة، وليس وصفًا لخدمات لم تُبن. المرجع التنفيذي Worker والاختبارات. جميع المسارات تحت `/api`، وJSON يعيد `{error}` عند الفشل. الخادم هو مصدر الصلاحية؛ العميل لا يرسل هوية أو منحًا لإثبات وصوله.

## اتفاقيات

- هوية Sites الموثوقة + عضو active لكل عمليات الديوان؛ التسجيل/التوثيق وhealth وwebhook لها شروط منفصلة.
- طلبات التغيير تحتاج Origin مطابقًا. هذا لا يغني عن هوية موثوقة عند نقل الاستضافة.
- `Idempotency-Key` من 8 إلى 100 حرف/رقم/شرطة/شرطة سفلية، فريد للعملية. إعادة الجسم والمسار نفسيهما تعيد النتيجة؛ تغييره يرفض بـ409. لا تستخدم المفتاح نفسه لطلب مختلف.
- التعديل يرسل `id` و`version` الحالي. تعارض الإصدار أو الرصيد يرد بـ409.
- المدخل المالي سلسلة ريال مثل `"115.50"`؛ المخزن والمخرج integer halala مثل `11550`. يمنع الجمع بالفاصلة العائمة.
- تواريخ العمل YYYY-MM-DD؛ طوابع الأحداث ISO UTC. أرقام الواجهة إنجليزية.
- القوائم والمرفقات والتقارير مصفاة بصلاحيات المستخدم. لا تستنتج بيانات حُجبت من غيابها.
- جسم JSON حتى 1MiB، التوثيق 4KiB، طلب multipart حتى 12MiB وملف حتى 10MiB. لا يوجد تحميل دفعة ملفات ضخمة غير محدود.

## الهوية والمستخدمون

| الطريقة والمسار | المدخل/المخرج | الضبط |
|---|---|---|
| GET /auth/status | اسم/حالة/توثيق الحساب الحالي وحالة التكاملات | لا يعيد حسابات الآخرين |
| POST /auth/request | phone مع رمز الدولة، consent=true | هوية Sites؛ challenge_id، expiry=300s، cooldown=60s |
| POST /auth/verify | challenge_id، code، name، notifications | 5 محاولات؛ ربط/إنشاء pending؛ لا يصدر جلسة مستقلة |
| POST /users/access-preview | العضو والحالة والمنح واللجان | users:manage؛ معاينة من نفس محرك الصلاحيات |
| POST /users/save | name، phone/email، status، grants، bundles، memberships | users:manage؛ حدود التفويض والمنع والانتهاء |
| POST /bundles/save | name، grants، id/version عند التعديل | منع تجاوز سلطة المفوض وإلغاء إدارته |
| POST /contact/preferences | whatsapp boolean | المستخدم الحالي فقط |

## العمل والسجلات

| الطريقة والمسار | الغرض | أهم الحقول |
|---|---|---|
| GET /state | بيانات الواجهة المسموحة | project اختياري |
| POST /projects/save | إنشاء/تعديل موسم | title، season، start، due، budget، status، site_location |
| POST /projects/clone | موسم جديد من الهيكل | id الأصل، title، season، start، due |
| POST /committees/save | لجنة وأعضاؤها وبنودها | project_id، name، manager_id، second_approver_id، review_delegate_id، members، config.budgetLines |
| POST /tasks/save | تكليف | title، project_id، assignee_id، due، description، meta.committee_id/type/outcome |
| GET /tasks/:id | مهمة ومحادثتها ومرفقاتها | tasks:view على السجل |
| POST /tasks/transition | تغيير المرحلة | id، version، status والسبب/الإثبات عند الحاجة وفق النموذج |
| POST /tasks/comment | رد/طلب داخل المهمة | id، body، mentions، reply_to، files |
| POST /tasks/checklist | تحديث بند التنفيذ | id، item_id، done |
| POST /tasks/reorder | ترتيب اللوحة | id، version، rank ضمن النطاق |
| POST /tasks/request | مساندة مرتبطة بالمهمة | parent_id ومسار المساندة وفق النموذج |
| POST /tasks/request-stage | تقدم طلب المساندة | id، version والمرحلة وفق النموذج |
| POST /suppliers/save | مورد أو ملف إعلامي | name، contact fields، site_location، media_profile، files |
| POST /assets/save | أصل مرقم/كمي/مستهلك | name، kind، ownership، quantity، category، category_detail، site_location، files؛ count من 1 إلى 50 للأصول الفردية الجديدة؛ serial يولده الخادم وثابت عند التعديل |
| POST /assets/move | صرف/استرجاع/استهلاك | id، type، quantity، member_id |
| POST /guides/save | دليل تنفيذ | title، project_id، task_id، content، approved |
| GET /guides/:id/export | بيانات PDF | صلاحية قراءة وتصدير الدليل أو مهمته |

تفاصيل الحقول الفرعية والتحقق في النماذج واختبارات governance/interface؛ لا تُرسل حقولًا غير موجودة اعتمادًا على هذا الملخص. site_location يحتوي label، notes، lat، lng أو null، ويختاره المستخدم على الخريطة.

حفظ الأصول يعيد `{id, ids, count}`. للأصل الفردي quantity=1، ولكل عنصر في ids رقم مستقل محفوظ. count أكبر من 1 غير مسموح للتعديل أو للصنف بالكمية. تكرار الطلب بمفتاحه يعيد السجلات نفسها حتى لو ربطت المرفقات في المحاولة السابقة. تفاصيل الطباعة في ASSET_LABELS.md.

## المالية

| المسار POST | العقد |
|---|---|
| /expenses/save | title، project_id، committee_id، budget_line_id، amount، tax، date، funding_source، files؛ task_id اختياري، advance_id عند الدفع من عهدة؛ status=draft أو pending |
| /expenses/review | id، version، decision=approve أو return، reason عند الإعادة. المسار محسوب من اللجنة والتعارض؛ لا يقبل قائمة معتمدين من العضو |
| /expenses/pay | id، amount، date، reference، files بإيصال reimbursement. المصروف مكتمل الاعتماد؛ لا يكرر تصفية advance/direct |
| /advances/create | title، project_id، committee_id، assignee_id، amount، date، reference، payment_method، purpose، files |
| /advances/entry | id، type=fund أو return، amount، date، reference والإثبات. خصم مصروف لا يسجل هنا؛ يأتي من الاعتماد |

التمويل: personal/advance/direct/unpaid. المدفوع من المال الخاص ينشئ owed_to_member بعد الاعتمادين، دون دفعة حتى إثبات سداد الجهة. استخدم effective_route وeffective_approval_index لعرض المعتمد الحالي؛ يعالج الخادم تغيّر المسؤولين.

## الملفات والتقارير

- POST `/upload` multipart: file، resource، entity إن وجد، project، committee، purpose، attach_later. الرد id/name/mime/size. الملفات الجديدة تربط مع حفظ السجل، ولا يقبل ملف مسودة يملكه شخص آخر.
- GET `/files/:id` يراجع الوصول في كل تنزيل؛ `inline=1` للصور/الصوت المسموح. R2 غير عام. ملفات المورد تتطلب edit، وملفات العمل الإعلامي تحتاج الوصول لمشروعه أيضًا.
- GET `/export?type=tasks|expenses|advances|projects|assets|suppliers|media|audit`، مع project وids اختياريين. يرجع بيانات التصدير المصرح بها؛ XLSX يصنعه exports.js.

## سند والربط والتشغيل

| الطريقة والمسار | العقد |
|---|---|
| POST /agent/ask | message حتى 6000 حرف، context={page,project_id,committee_id,task_id}. الرد id/reply/proposal/tokens/context/policy_version |
| GET /agent/history | حتى 20 دورًا حديثًا للمستخدم، بعد ترشيح بصمة الوصول ومدة الحفظ |
| POST /agent/history/clear | يحذف محادثات المستخدم الحالي فقط |
| POST /agent/transcribe | multipart file صوت حتى 10MiB؛ الرد text للمراجعة قبل الإرسال |
| POST /extract | file_id لفاتورة/إيصال مسموح؛ fields.{value,confidence}؛ غير الواضح=null |
| GET /integrations/status | حالة الإعدادات والتسليم؛ settings:manage |
| GET /readiness | components/missing/issues/external_gates/maintenance؛ لا يعيد قيم أسرار |
| POST /maintenance/run | صيانة وتذكيرات ثم معالجة الإرسال؛ settings:manage |
| POST /integrations/dispatch | معالجة حتى 20 تنبيهًا جاهزًا؛ settings:manage |
| GET/POST /webhooks/whatsapp | challenge verify أو HMAC-SHA256 لجسم الحدث |
| POST /settings/save | settings وversion؛ تخصيص سند تحت settings.sanad |
| GET /health | فحص D1 ووجود ربط الملفات؛ 503 عند تعذر التخزين |

الطلبات إلى OpenAI من الخادم بـstore:false؛ أدوات strict ذات additionalProperties:false. راجع [وثائق استدعاء الأدوات الرسمية](https://developers.openai.com/api/docs/guides/function-calling). `prepare_record` يعود بمسودة؛ البحث والقراءة والتلخيص لا يغيرون السجلات. لا توجد أداة SQL أو اعتماد أو دفع.
