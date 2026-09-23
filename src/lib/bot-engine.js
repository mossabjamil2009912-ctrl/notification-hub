/* eslint-disable */
// ACTES bot engine — ported verbatim from the n8n "State Machine" node.
// Do not reformat: logic must stay identical to the WhatsApp bot.

const Buffer = {
  from: function (data, enc) {
    if (enc === 'base64') {
      var bin = atob(String(data));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { toString: function () { return new TextDecoder().decode(bytes); } };
    }
    var enc2 = new TextEncoder().encode(String(data));
    var bin2 = '';
    for (var j = 0; j < enc2.length; j++) bin2 += String.fromCharCode(enc2[j]);
    return { toString: function () { return btoa(bin2); } };
  }
};

export function runStateMachine(__session, __parsed, __itemPrices) {
  var FX_YER = 530; var FX_SAR = 530/140;
  var SINV_IMG = { lp16: 'lipower16', lp62: 'lipower62', deye8: 'deye8', deye12s: 'deye12', deye16: 'deye16', deye12: 'deye12t', deye16t: 'deye16t', deye20: 'deye20t', deye50: 'deye50t', solis50: 'solis50' };
  var PKG_IMG = { r1: 'lipower16', r2: 'lipower16', r3: 'lipower16', r4: 'lipower16', r5: 'lipower16', r6: 'lipower62', r7: 'lipower62', r8: 'lipower62', r9: 'lipower62', r10: 'deye8', r11: 'deye8', r12: 'deye8', r13: 'deye8', r14: 'deye8', r15: 'deye12', r16: 'deye12' };
  var COM_IMG = { p8: 'deye8', p9: 'deye8', p14: 'deye8', p16: 'deye8', p18: 'deye8',
    i12p9: 'deye12', i12p18: 'deye12', i12p21: 'deye12', i12p27: 'deye12',
    i16p18: 'deye16', i16p21: 'deye16', i16p24: 'deye16', i16p36: 'deye16',
    i16t26: 'deye16t', i16t30: 'deye16t', i16t33: 'deye16t', i16t36: 'deye16t',
    i20t30: 'deye20t', i20t33: 'deye20t', i20t39: 'deye20t', i20t52: 'deye20t',
   };
  function fxMoney(n){ return Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fxLines(usd){ usd = Number(usd)||0; return 'الإجمالي بالدولار الأمريكي: ' + fxMoney(usd) + ' $'; }

  const session = __session || {};
  var ITEM_PRICES = __itemPrices || {};
  const pd = __parsed || {};
  const phone = pd.phone || '';
  const message_id = String(pd.message_id || '');
  var text = (pd.text || '').trim();
  // قبول الأرقام العربية (٠١٢٣٤٥٦٧٨٩) والفارسية (۰۱۲۳۴۵۶۷۸۹) والإنجليزية (0123456789)
  function normalizeInputDigits(s) {
    return String(s || '')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.')
      .replace(/٬/g, ',');
  }
  text = normalizeInputDigits(text);
  if (text === '00') { text = 'back_step'; }
  const phone_number_id = pd.phone_number_id || '';
  const now = new Date().toISOString();

  let step = session.step || 'start';
  let lang = 'ar';
  let menu_choice = session.menu_choice || '';
  let customer_name = session.customer_name || '';
  let city = session.city || '';
  let system_type = session.system_type || '';
  var inv_pick = null;
  var inv_pick_line = '';
  let monthly_consumption = session.monthly_consumption || '';
  let peak_load = session.peak_load || '';
  let night_hours = session.night_hours || '';
  let activity_type = session.activity_type || '';
  let main_loads = session.main_loads || '';
  let load_type = session.load_type || '';
  let pump_capacity = session.pump_capacity || '';
  let daily_hours = session.daily_hours || '';
  let device_type = session.device_type || '';
  let problem_desc = session.problem_desc || '';
  let project_type = session.project_type || '';
  let service_needed = session.service_needed || '';
  let wants_quote = session.wants_quote || '';
  let phase_type = session.phase_type || '';
  let quote_file_url = '';
  let item_quote = false;
  let quote_items = [];
  let cart = [];
  try { var _c = JSON.parse(String(session.cart || '') || '[]'); if (Array.isArray(_c)) { cart = _c; } } catch (e) { cart = []; }
  let quote_file_name = '';
  let quote_number = '';
  let quote_caption = '';
  let send_quote_file = false;

  // ===== QUOTE SYSTEM CONTEXT (single source for SLD/PVsyst) =====
  function decodeQuoteContext(raw) {
    var s = String(raw || '');
    var ix = s.indexOf('|QS=');
    if (ix < 0) return null;
    var b64 = s.slice(ix + 4).split('|')[0];
    if (!b64) return null;
    try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch (e) { return null; }
  }
  function packQuoteContext(qnum, items) {
    if (!qnum || !Array.isArray(items) || !items.length) return '';
    var ctx = {
      v: 2,
      quote_number: String(qnum),
      customer_name: String(customer_name || ''),
      city: String(city || ''),
      phase_type: String(phase_type || ''),
      system_type: String(system_type || ''),
      project_type: String(project_type || ''),
      quote_items: items.map(function (it) {
        return {
          key: String(it.key || ''),
          name: String(it.name || ''),
          details: Array.isArray(it.details) ? it.details.map(String) : [],
          unit: String(it.unit || ''),
          qty: Number(it.qty) || 0,
          price: Number(it.price) || 0,
          total: Number(it.total) || 0
        };
      })
    };
    return Buffer.from(JSON.stringify(ctx), 'utf8').toString('base64');
  }
  var quote_context = decodeQuoteContext(session.project_type || '');
  if (quote_context && quote_context.quote_number) {
    quote_number = String(quote_context.quote_number);
    if (quote_context.customer_name && !customer_name) customer_name = String(quote_context.customer_name);
    if (quote_context.city && !city) city = String(quote_context.city);
    if (quote_context.phase_type && !phase_type) phase_type = String(quote_context.phase_type);
  }
  let send_study_file = false;
  var study_params = null;
  let make_sld = false;
  let followup_kind = '';
  let study_intro_pending = false;
  var res_method = String(activity_type || '').replace(/^res_/, '');
  if (!/^[123]$/.test(res_method)) { res_method = ''; }
  var sld_params = null;

  let response = '';
  let notify_employee = false;
  let notification_text = '';

  var BD = '';
  var SEP = '━━━━━━━━━━━━━━━━━━━━';
  var LINE = '────────────────────';
  var AC = ' أكتس لأنظمة الطاقة وحلولها';

  function W(msg) {
    var _wm = String(msg || '');
    if (_wm.indexOf('أكتس لأنظمة الطاقة وحلولها') >= 0) {
      return SEP + '\n' + _wm;
    }
    return AC + '\n' + SEP + '\n' + _wm;
  }

  var WEL_AR = 'أكتس لأنظمة الطاقة وحلولها' + '\n' + SEP + '\n' +
    ' شركة أكتس' + '\n' +
    ' لأنظمة الطاقة وحلولها' + '\n' +
    ' _ SUNTECH_' + '\n' +
    ' _Li Power_' + '\n' +
    ' _ PYLONTECH_' + '\n' +
    ' _HTHIUM_' + '\n' +
    SEP + '\n' +
    ' أهلاً وسهلاً بكم' + '\n' +
    ' اختر لغتك من الأزرار التالية';

  var WELCOME_SERVICES_AR = 'مرحباً بك في أكتس لأنظمة الطاقة وحلولها \n' +
    SEP + '\n' +
    'نحن متخصصون في توفير حلول الطاقة الشمسية، وأنظمة تخزين الطاقة، والبطاريات، والانفرترات، إلى جانب حلول متكاملة للمشاريع السكنية والتجارية والصناعية.\n\n' +
    'يسعدنا خدمتك يرجى اختيار الخدمة المطلوبة من الأزرار التالية:';

  function goWelcome() { return WELCOME_SERVICES_AR; }
  function energyWelcome() { return 'مرحباً بك في مسار حلول الطاقة\n' + SEP + '\nاختر الخدمة المطلوبة من الأزرار التالية:_'; }
  function goStart() { return WEL_AR; }

  var EMP_PHONE = '773590979';
  var LOGO_URL = 'https://files.catbox.moe/51vb2e.png';
  var WELCOME_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg';
  var OTHER_MESSAGES_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg';
  var MENU_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg';
  var PVSTUDY_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg'; // هوية ACTES الموحدة
  var SLD_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg'; // هوية ACTES الموحدة
  var QUOTE_NEXT_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg'; // هوية ACTES الموحدة
  var PAY_WALLET_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg'; // هوية ACTES الموحدة
  var PAY_NETWORK_IMAGE_URL = 'https://id-preview--8ef76cea-5bcb-46b0-b3b8-8f6ed641ea8b.lovable.app/__l5e/assets-v1/a85cc020-9f00-4543-857f-18af00d2dcd1/ACTES_message_header_compressed_v2.jpg'; // هوية ACTES الموحدة
  function payWayText() { return String(service_needed || session.service_needed || ''); }
  function payHeaderImage() {
    var w = payWayText();
    if (/محفظة|محافظ/.test(w)) { return PAY_WALLET_IMAGE_URL; }
    if (/شبكة|شبكات/.test(w)) { return PAY_NETWORK_IMAGE_URL; }
    return null;
  }
  function headerImageForStep(st) {
    st = String(st || '');
    if (/^pay_/.test(st)) { return payHeaderImage(); }
    if (st === 'qnext_ask' || st === 'res_quote_ask' || st === 'agr_quote_ask' || st === 'com_quote_ask') { return QUOTE_NEXT_IMAGE_URL; }
    if (/sld/.test(st)) return SLD_IMAGE_URL;
    if (/study|pvsyst/.test(st)) return PVSTUDY_IMAGE_URL;
    if (/menu|method|bill|value|quote/.test(st)) return MENU_IMAGE_URL;
    return OTHER_MESSAGES_IMAGE_URL;
  }
  var VIDEO_URL = 'https://files.catbox.moe/hltktc.mp4';
  // سعر الكيلو وات ساعة بالريال اليمني (يُقسم عليه مبلغ الفاتورة لمعرفة الاستهلاك بالكيلو وات)
  var KWH_PRICE = 250;

  // ======================================================================
  // منظومات السكني — مطابقة حرفياً لملف الإكسل ACTES_عروض_السكني_والتجاري_v2
  // daily = قيمة الرنج كما في الإكسل (تُحوّل لاحقاً لإنتاج يومي محسوب لمنظومات 1.6 و6.2)
  // items = [مفتاح الكتالوج، الصنف، المواصفات، وصف الكمية، الكمية، سعر الوحدة $]
  // ======================================================================
  var RES_TABLE = [
    { code: 'r1', invKw: 1.6, cat: '٣', daily: 1.2, quote: 'ACTES-608',
      name: 'منظومة سكني — انفرتر 1.6 كيلو (لوح 595W + بطارية 1.28 كيلو)',
      label: 'انفرتر 1.6 كيلو — بطارية 1.28 كيلو — 1 لوح 595W',
      items: [
        ['panel:595', 'ألواح طاقة شمسية سنتك 595 وات ثنائية الوجه', ['الموديل STP595S-C54/Nshm+', 'كفاءة 23.0%', 'Vmp 43.02 V | Imp 13.83 A', 'Voc 51.81 V | Isc 14.56 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '1 حبة', 1, 110],
        ['inverter:1.6:1', 'انفرتر هايبرد ليو باور 1.6 كيلو', ["سنجل فاز 12 فولت", "قدرة خرج 1600W | أقصى قدرة PV: 2000W", "MPPT: 30-500V DC | Vmp الأمثل 300-400V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 14A | أقصى شحن PV 100A | أقصى شحن من الشبكة 60A | أقصى شحن 100A", "خرج 220/230/240VAC ±5% | موجة جيبية نقية | Peak 3200VA | UPS 10ms / APL 20ms"], '1 حبة', 1, 180],
        ['battery:1.28', 'بطارية ليثيوم بايلونتك 1.28 كيلو', ['100 أمبير 12.8 فولت', 'الموديل: RV12100', 'الطاقة الاسمية 1280 Wh', 'المقاومة الداخلية <10 mΩ', 'التفريغ الذاتي ≤3% شهرياً', 'أقصى 8 بطاريات على التوازي', 'دورات الحياة >4500 دورة عند DOD 80%', 'التفريغ المستمر 100A | الذروة 200A/10s', 'الشحن الموصى به ≤50A | أقصى شحن مستمر 100A', 'جهد الشحن الموصى به 14~14.4V', 'التشغيل -20~50°C | التخزين -20~60°C', 'التخزين الموصى به 10~40°C', 'الرطوبة 5%~95% | الارتفاع 4000m', 'Heating Film', 'UN38.3 / MSDS', '300×160×210 mm | 12 kg', 'M8×1.25×14 mm | 8±1 Nm', 'IP20 | LiFePO4 | Natural Cooling'], '1 حبة', 1, 220],
        ['', 'استند 100 أمبير 12 فولت مع لوحة الحماية الكاملة', ['حامل حديد مع لوحة حماية AC/DC'], '1 حبة', 1, 60],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '20 متر', 20, 2]
      ] },
    { code: 'r2', invKw: 1.6, cat: '١', daily: 2.5, quote: 'ACTES-609',
      name: 'منظومة سكني — انفرتر 1.6 كيلو (لوح 595W + بطارية 2.56 كيلو)',
      label: 'انفرتر 1.6 كيلو — بطارية 2.56 كيلو — 1 لوح 595W',
      items: [
        ['panel:595', 'ألواح طاقة شمسية سنتك 595 وات ثنائية الوجه', ['الموديل STP595S-C54/Nshm+', 'كفاءة 23.0%', 'Vmp 43.02 V | Imp 13.83 A', 'Voc 51.81 V | Isc 14.56 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '1 حبة', 1, 110],
        ['inverter:1.6:1', 'انفرتر هايبرد ليو باور 1.6 كيلو', ["سنجل فاز 12 فولت", "قدرة خرج 1600W | أقصى قدرة PV: 2000W", "MPPT: 30-500V DC | Vmp الأمثل 300-400V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 14A | أقصى شحن PV 100A | أقصى شحن من الشبكة 60A | أقصى شحن 100A", "خرج 220/230/240VAC ±5% | موجة جيبية نقية | Peak 3200VA | UPS 10ms / APL 20ms"], '1 حبة', 1, 180],
        ['battery:2.56', 'بطارية ليثيوم بايلونتك 2.56 كيلو', ['200 أمبير 12.8 فولت', 'الموديل: RV12200', 'الطاقة الاسمية 2560 Wh', 'المقاومة الداخلية <10 mΩ | الكفاءة 99%', 'التفريغ الذاتي ≤3% شهرياً', 'أقصى توصيل 4S4P (حتى 16 بطارية)', 'دورات الحياة >4000 دورة', 'التفريغ المستمر 100A | الذروة 200A/5s', 'الشحن المستمر الأقصى 100A', 'جهد الشحن الموصى به 14~14.6V', 'درجة التفريغ -20~60°C | الشحن 0~55°C', 'التشغيل -20~50°C | التخزين -40~60°C', 'الرطوبة 5%~95% | الارتفاع 4000m', 'Heating: Support | BLE 5.0 | Pylontech Auto', 'UL1973 / FCC / CE / UKCA / Bluetooth SIG', '459×190×215 mm | 20.9 kg', 'M8×1.25×14 mm | 9±1 Nm', 'PC | IP65 | LiFePO4'], '1 حبة', 1, 350],
        ['', 'استند 200 أمبير 12 فولت مع لوحة الحماية الكاملة', ['حامل حديد مع لوحة حماية AC/DC'], '1 حبة', 1, 60],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '20 متر', 20, 2]
      ] },
    { code: 'r3', invKw: 1.6, cat: '٢', daily: 2.5, quote: 'ACTES-609',
      name: 'منظومة سكني — انفرتر 1.6 كيلو (لوحان 595W + بطارية 2.56 كيلو)',
      label: 'انفرتر 1.6 كيلو — بطارية 2.56 كيلو — 2 ألواح 595W',
      items: [
        ['panel:595', 'ألواح طاقة شمسية سنتك 595 وات ثنائية الوجه', ['الموديل STP595S-C54/Nshm+', 'كفاءة 23.0%', 'Vmp 43.02 V | Imp 13.83 A', 'Voc 51.81 V | Isc 14.56 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '2 حبة', 2, 110],
        ['inverter:1.6:1', 'انفرتر هايبرد ليو باور 1.6 كيلو', ["سنجل فاز 12 فولت", "قدرة خرج 1600W | أقصى قدرة PV: 2000W", "MPPT: 30-500V DC | Vmp الأمثل 300-400V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 14A | أقصى شحن PV 100A | أقصى شحن من الشبكة 60A | أقصى شحن 100A", "خرج 220/230/240VAC ±5% | موجة جيبية نقية | Peak 3200VA | UPS 10ms / APL 20ms"], '1 حبة', 1, 180],
        ['battery:2.56', 'بطارية ليثيوم بايلونتك 2.56 كيلو', ['200 أمبير 12.8 فولت', 'الموديل: RV12200', 'الطاقة الاسمية 2560 Wh', 'المقاومة الداخلية <10 mΩ | الكفاءة 99%', 'التفريغ الذاتي ≤3% شهرياً', 'أقصى توصيل 4S4P (حتى 16 بطارية)', 'دورات الحياة >4000 دورة', 'التفريغ المستمر 100A | الذروة 200A/5s', 'الشحن المستمر الأقصى 100A', 'جهد الشحن الموصى به 14~14.6V', 'درجة التفريغ -20~60°C | الشحن 0~55°C', 'التشغيل -20~50°C | التخزين -40~60°C', 'الرطوبة 5%~95% | الارتفاع 4000m', 'Heating: Support | BLE 5.0 | Pylontech Auto', 'UL1973 / FCC / CE / UKCA / Bluetooth SIG', '459×190×215 mm | 20.9 kg', 'M8×1.25×14 mm | 9±1 Nm', 'PC | IP65 | LiFePO4'], '1 حبة', 1, 350],
        ['', 'استند 200 أمبير 12 فولت مع لوحة الحماية الكاملة', ['حامل حديد مع لوحة حماية AC/DC'], '1 حبة', 1, 60],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '20 متر', 20, 2]
      ] },
    { code: 'r4', invKw: 1.6, cat: '٤', daily: 4, quote: 'ACTES-607',
      name: 'منظومة سكني — انفرتر 1.6 كيلو (لوحان 595W + بطارية 4 كيلو)',
      label: 'انفرتر 1.6 كيلو — بطارية 4 كيلو — 2 ألواح 595W',
      items: [
        ['panel:595', 'ألواح طاقة شمسية سنتك 595 وات ثنائية الوجه', ['الموديل STP595S-C54/Nshm+', 'كفاءة 23.0%', 'Vmp 43.02 V | Imp 13.83 A', 'Voc 51.81 V | Isc 14.56 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '2 حبة', 2, 110],
        ['inverter:1.6:1', 'انفرتر هايبرد ليو باور 1.6 كيلو', ["سنجل فاز 12 فولت", "قدرة خرج 1600W | أقصى قدرة PV: 2000W", "MPPT: 30-500V DC | Vmp الأمثل 300-400V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 14A | أقصى شحن PV 100A | أقصى شحن من الشبكة 60A | أقصى شحن 100A", "خرج 220/230/240VAC ±5% | موجة جيبية نقية | Peak 3200VA | UPS 10ms / APL 20ms"], '1 حبة', 1, 180],
        ['battery:4', 'بطارية ليثيوم هيثيوم 4 كيلو', ['314 أمبير 12.8 فولت', 'الموديل: HeroEE NeoPower 4', 'الطاقة الاسمية حوالي 4.02 kWh', 'أقصى توصيل 4S أو 8P', 'دورات الحياة 6000 دورة', 'التفريغ المستمر 160A | الذروة 320A/10s', 'الشحن المستمر الأقصى 160A | الموصى به ≤50A', 'جهد الشحن الموصى به 14~14.4V', 'التخزين الموصى به 10~35°C | التشغيل -20~50°C', 'الرطوبة 5%~95% | الارتفاع <4000m', 'Switch: Yes | Heating Film: Yes', 'CE / UN38.3', '340×280×235 mm | ≈31.5 kg', 'M8×1.25×14 mm | 8±1 Nm', 'Metal | IP55 | LiFePO4'], '1 حبة', 1, 420],
        ['', 'استند 314 أمبير 12 فولت مع لوحة الحماية الكاملة', ['حامل حديد مع لوحة حماية AC/DC'], '1 حبة', 1, 100],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2]
      ] },
    { code: 'r5', invKw: 1.6, cat: '٥', daily: 4, quote: 'ACTES-607',
      name: 'منظومة سكني — انفرتر 1.6 كيلو (3 ألواح 595W + بطارية 4 كيلو)',
      label: 'انفرتر 1.6 كيلو — بطارية 4 كيلو — 3 ألواح 595W',
      items: [
        ['panel:595', 'ألواح طاقة شمسية سنتك 595 وات ثنائية الوجه', ['الموديل STP595S-C54/Nshm+', 'كفاءة 23.0%', 'Vmp 43.02 V | Imp 13.83 A', 'Voc 51.81 V | Isc 14.56 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '3 حبة', 3, 110],
        ['inverter:1.6:1', 'انفرتر هايبرد ليو باور 1.6 كيلو', ["سنجل فاز 12 فولت", "قدرة خرج 1600W | أقصى قدرة PV: 2000W", "MPPT: 30-500V DC | Vmp الأمثل 300-400V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 14A | أقصى شحن PV 100A | أقصى شحن من الشبكة 60A | أقصى شحن 100A", "خرج 220/230/240VAC ±5% | موجة جيبية نقية | Peak 3200VA | UPS 10ms / APL 20ms"], '1 حبة', 1, 180],
        ['battery:4', 'بطارية ليثيوم هيثيوم 4 كيلو', ['314 أمبير 12.8 فولت', 'الموديل: HeroEE NeoPower 4', 'الطاقة الاسمية حوالي 4.02 kWh', 'أقصى توصيل 4S أو 8P', 'دورات الحياة 6000 دورة', 'التفريغ المستمر 160A | الذروة 320A/10s', 'الشحن المستمر الأقصى 160A | الموصى به ≤50A', 'جهد الشحن الموصى به 14~14.4V', 'التخزين الموصى به 10~35°C | التشغيل -20~50°C', 'الرطوبة 5%~95% | الارتفاع <4000m', 'Switch: Yes | Heating Film: Yes', 'CE / UN38.3', '340×280×235 mm | ≈31.5 kg', 'M8×1.25×14 mm | 8±1 Nm', 'Metal | IP55 | LiFePO4'], '1 حبة', 1, 420],
        ['', 'استند 314 أمبير 12 فولت مع لوحة الحماية الكاملة', ['حامل حديد مع لوحة حماية AC/DC'], '1 حبة', 1, 100],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2]
      ] },
    { code: 'r6', invKw: 6.2, cat: '١', daily: 5, quote: 'ACTES-613',
      name: 'منظومة سكني — انفرتر 6.2 كيلو (4 ألواح 720W + بطارية 5.12 كيلو)',
      label: 'انفرتر 6.2 كيلو — بطارية 5.12 كيلو — 4 ألواح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '4 حبة', 4, 130],
        ['inverter:6.2:1', 'انفرتر هايبرد ليو باور 6.2 كيلو', ["سنجل فاز 48 فولت", "قدرة خرج 6200W | القدرة الاسمية للـPV inverter 6500W | أقصى قدرة PV: 8500W", "MPPT: 60-500V DC | Vmp الأمثل 360-430V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 27A | أقصى شحن PV 120A | أقصى شحن من الشبكة 100A | أقصى شحن 120A", "خرج 220/230/240VAC ±5% | تيار الخرج 26.9A | كفاءة التحويل DC-AC حتى 98% | Peak 12400VA"], '1 حبة', 1, 400],
        ['battery:5.12', 'بطارية ليثيوم بايلونتك 5.12 كيلو', ['51.2 فولت', 'الموديل: UF5000'], '1 حبة', 1, 750],
        ['', 'استند منظومة ليثيوم 6 كيلو مع لوحة الحماية', ['الموديل: PRO-1'], '1 حبة', 1, 100],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r7', invKw: 6.2, cat: '٢', daily: 7.5, quote: 'ACTES-613',
      name: 'منظومة سكني — انفرتر 6.2 كيلو (4 ألواح 720W + بطارية 5.12 كيلو)',
      label: 'انفرتر 6.2 كيلو — بطارية 5.12 كيلو — 4 ألواح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '4 حبة', 4, 130],
        ['inverter:6.2:1', 'انفرتر هايبرد ليو باور 6.2 كيلو', ["سنجل فاز 48 فولت", "قدرة خرج 6200W | القدرة الاسمية للـPV inverter 6500W | أقصى قدرة PV: 8500W", "MPPT: 60-500V DC | Vmp الأمثل 360-430V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 27A | أقصى شحن PV 120A | أقصى شحن من الشبكة 100A | أقصى شحن 120A", "خرج 220/230/240VAC ±5% | تيار الخرج 26.9A | كفاءة التحويل DC-AC حتى 98% | Peak 12400VA"], '1 حبة', 1, 400],
        ['battery:5.12', 'بطارية ليثيوم بايلونتك 5.12 كيلو', ['51.2 فولت', 'الموديل: UF5000'], '1 حبة', 1, 750],
        ['', 'استند منظومة ليثيوم 6 كيلو مع لوحة الحماية', ['الموديل: PRO-1'], '1 حبة', 1, 100],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r8', invKw: 6.2, cat: '٣', daily: 13, quote: 'ACTES-616',
      name: 'منظومة سكني — انفرتر 6.2 كيلو (5 ألواح 720W + بطاريتين 5.12 كيلو)',
      label: 'انفرتر 6.2 كيلو — بطارية 10.24 كيلو — 5 ألواح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '5 حبة', 5, 130],
        ['inverter:6.2:1', 'انفرتر هايبرد ليو باور 6.2 كيلو', ["سنجل فاز 48 فولت", "قدرة خرج 6200W | القدرة الاسمية للـPV inverter 6500W | أقصى قدرة PV: 8500W", "MPPT: 60-500V DC | Vmp الأمثل 360-430V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 27A | أقصى شحن PV 120A | أقصى شحن من الشبكة 100A | أقصى شحن 120A", "خرج 220/230/240VAC ±5% | تيار الخرج 26.9A | كفاءة التحويل DC-AC حتى 98% | Peak 12400VA"], '1 حبة', 1, 400],
        ['battery:5.12', 'بطارية ليثيوم بايلونتك 5.12 كيلو', ['51.2 فولت', 'الموديل: UF5000'], '2 حبة', 2, 750],
        ['', 'استند منظومة ليثيوم 6 كيلو مع لوحة الحماية', ['الموديل: PRO-1'], '1 حبة', 1, 100],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r9', invKw: 6.2, cat: '٤', daily: 21, quote: 'ACTES-627',
      name: 'منظومة سكني — انفرتر 6.2 كيلو (6 ألواح 720W + بطارية 16 كيلو)',
      label: 'انفرتر 6.2 كيلو — بطارية 16 كيلو — 6 ألواح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '6 حبة', 6, 130],
        ['inverter:6.2:1', 'انفرتر هايبرد ليو باور 6.2 كيلو', ["سنجل فاز 48 فولت", "قدرة خرج 6200W | القدرة الاسمية للـPV inverter 6500W | أقصى قدرة PV: 8500W", "MPPT: 60-500V DC | Vmp الأمثل 360-430V | أقصى جهد PV 500V", "تيار دخل PV الأقصى 27A | أقصى شحن PV 120A | أقصى شحن من الشبكة 100A | أقصى شحن 120A", "خرج 220/230/240VAC ±5% | تيار الخرج 26.9A | كفاءة التحويل DC-AC حتى 98% | Peak 12400VA"], '1 حبة', 1, 400],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '1 حبة', 1, 1800],
        ['', 'استند منظومة ليثيوم 6 كيلو مع لوحة الحماية', ['الموديل: PRO-1'], '1 حبة', 1, 100],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r10', invKw: 8, cat: '١', daily: 31.7, quote: 'ACTES-631',
      name: 'منظومة سكني — انفرتر 8 كيلو (8 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 8 كيلو — بطارية 16 كيلو — 8 ألواح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '8 حبة', 8, 130],
        ['inverter:8:1', 'انفرتر دايا هايبرد DEYE 8 كيلو سنجل فاز', ['الموديل: SUN-8K-SG01LP1-EU', '48 فولت هايبرد'], '1 حبة', 1, 1100],
        ['dc:2', 'لوحة حماية تيار مستمر 2 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 35],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '1 حبة', 1, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '1 متر', 1, 2.70],
        ['acc:install', 'كنشات توصيل MC4 مقاس 10 ملي', ['أطقم توصيل أصلية'], '3 طقم', 3, 2]
      ] },
    { code: 'r11', invKw: 8, cat: '٢', daily: 35.6, quote: 'ACTES-674',
      name: 'منظومة سكني — انفرتر 8 كيلو (9 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 8 كيلو — بطارية 16 كيلو — 9 ألواح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '9 حبة', 9, 130],
        ['inverter:8:1', 'انفرتر دايا هايبرد DEYE 8 كيلو سنجل فاز', ['الموديل: SUN-8K-SG01LP1-EU', '48 فولت هايبرد'], '1 حبة', 1, 1100],
        ['dc:2', 'لوحة حماية تيار مستمر 2 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 35],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '1 حبة', 1, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r12', invKw: 8, cat: '٣', daily: 55.4, quote: 'ACTES-671',
      name: 'منظومة سكني — انفرتر 8 كيلو (14 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 8 كيلو — بطارية 32 كيلو — 14 لوح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '14 حبة', 14, 130],
        ['inverter:8:1', 'انفرتر دايا هايبرد DEYE 8 كيلو سنجل فاز', ['الموديل: SUN-8K-SG01LP1-EU', '48 فولت هايبرد'], '1 حبة', 1, 1100],
        ['dc:2', 'لوحة حماية تيار مستمر 2 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 35],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '2 حبة', 2, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r13', invKw: 8, cat: '٤', daily: 63.4, quote: 'ACTES-673',
      name: 'منظومة سكني — انفرتر 8 كيلو (16 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 8 كيلو — بطارية 32 كيلو — 16 لوح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '16 حبة', 16, 130],
        ['inverter:8:1', 'انفرتر دايا هايبرد DEYE 8 كيلو سنجل فاز', ['الموديل: SUN-8K-SG01LP1-EU', '48 فولت هايبرد'], '1 حبة', 1, 1100],
        ['dc:2', 'لوحة حماية تيار مستمر 2 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 35],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '2 حبة', 2, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r14', invKw: 8, cat: '٥', daily: 71.3, quote: 'ACTES-672',
      name: 'منظومة سكني — انفرتر 8 كيلو (18 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 8 كيلو — بطارية 32 كيلو — 18 لوح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '18 حبة', 18, 130],
        ['inverter:8:1', 'انفرتر دايا هايبرد DEYE 8 كيلو سنجل فاز', ['الموديل: SUN-8K-SG01LP1-EU', '48 فولت هايبرد'], '1 حبة', 1, 1100],
        ['dc:2', 'لوحة حماية تيار مستمر 2 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 35],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '2 حبة', 2, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r15', invKw: 12, cat: '٣', daily: 83.2, quote: 'ACTES-685',
      name: 'منظومة سكني — انفرتر 12 كيلو (21 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 12 كيلو — بطارية 38 كيلو — 21 لوح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '21 حبة', 21, 130],
        ['inverter:12:1', 'انفرتر دايا هايبرد DEYE 12 كيلو سنجل فاز', ['الموديل: SUN-12K-SG01LP1-EU-AM3', '48 فولت هايبرد'], '1 حبة', 1, 1800],
        ['dc:3', 'لوحة حماية تيار مستمر 3 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 45],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '2 حبة', 2, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] },
    { code: 'r16', invKw: 12, cat: '٤', daily: 106.9, quote: 'ACTES-678',
      name: 'منظومة سكني — انفرتر 12 كيلو (27 لوح 720W + بطارية فيدوس 16 كيلو)',
      label: 'انفرتر 12 كيلو — بطارية 57 كيلو — 27 لوح 720W',
      items: [
        ['panel:720', 'ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['الموديل STP720S-D66/Nsh+', 'كفاءة 23.2%', 'Vmp 38.00 V | Imp 17.81 A', 'Voc 48.45 V | Isc 18.83 A', 'معامل ثنائية الوجه 80 ± 5%', 'جهد النظام الأقصى 1500 V DC', 'ضمان المنتج 25 سنة'], '27 حبة', 27, 130],
        ['inverter:12:1', 'انفرتر دايا هايبرد DEYE 12 كيلو سنجل فاز', ['الموديل: SUN-12K-SG01LP1-EU-AM3', '48 فولت هايبرد'], '1 حبة', 1, 1800],
        ['dc:3', 'لوحة حماية تيار مستمر 3 مجموعات (صندوق تجميع DC)', ['حماية DC مع مانع صواعق'], '1 حبة', 1, 45],
        ['ac:1', 'لوحة حماية كهرباء تيار متردد سنجل فاز', ['قواطع حماية AC'], '1 حبة', 1, 35],
        ['battery:16', 'بطارية ليثيوم بايلونتك فيدوس 16 كيلو', ['51.2 فولت IP65', 'الموديل: Fidus-FB-L-16-PRO', 'السعة الاسمية 16076 Wh | السعة القابلة للاستخدام 16076 Wh | DOD 100%', 'الشحن/التفريغ المستمر 200A / 200A | الذروة 300A/15s', 'جهد الشحن 56~56.8V | جهد التفريغ 40~56.8V', '8000 دورة | 130 kg | 435×240×900 mm | IP65'], '3 حبة', 3, 1800],
        ['cable', 'كابل نحاس مجلفن 1500 فولت مفرد 6 مم', ['كابل تركي'], '30 متر', 30, 2.30]
      ] }
  ];
  // أصناف الانفرترات في السكني (لأن قائمة واتساب لا تتحمل 16 صفاً)
  var RES_INV_CLASSES = (function () {
    var seen = [], out = [];
    for (var i = 0; i < RES_TABLE.length; i++) {
      var k = RES_TABLE[i].invKw;
      if (seen.indexOf(k) === -1) { seen.push(k); out.push({ kw: k, id: 'resinv_' + k }); }
    }
    return out;
  })();
  function resInvSel() { var m = String(activity_type || '').match(/^resinv_([\d.]+)$/); return m ? parseFloat(m[1]) : null; }
  function resPanelCount(code) {
    var it = resItemsOf(code), n = 0;
    for (var i = 0; i < it.length; i++) {
      if (String(it[i][0]).indexOf('panel:') === 0) n += Number(it[i][4]) || 0;
    }
    return n;
  }
  function resListOfClass(kw) {
    var out = [], seen = {};
    for (var i = 0; i < RES_TABLE.length; i++) {
      if (RES_TABLE[i].invKw !== kw) continue;
      var sig = [RES_TABLE[i].invKw, resBatKwh(RES_TABLE[i].code), resPanelCount(RES_TABLE[i].code), resPanelWatt(RES_TABLE[i].code)].join('|');
      if (seen[sig]) continue;
      seen[sig] = true;
      out.push(RES_TABLE[i]);
    }
    out.sort(function(a,b) {
      var ba = resBatKwh(a.code), bb = resBatKwh(b.code);
      if (ba !== bb) return ba - bb;
      var pa = resPanelCount(a.code), pb = resPanelCount(b.code);
      return pa - pb;
    });
    return out;
  }
  function resPanelWatt(code) {
    var it = resItemsOf(code);
    for (var i = 0; i < it.length; i++) {
      var k = String(it[i][0] || '');
      if (k.indexOf('panel:') === 0) {
        return parseFloat(k.split(':')[1]) || 0;
      }
    }
    return 0;
  }
  function resPanelText(code) {
    var n = resPanelCount(code), w = resPanelWatt(code);
    var unit = n === 1 ? 'لوح' : 'ألواح';
    return n + ' ' + unit + ' ' + w + 'W';
  }
  function resOptionTitle(r) {
    return String(r.invKw) + ' كيلو — بطارية ' + String(resBatKwh(r.code));
  }
  function resOptionDescription(r) {
    return 'انفرتر ' + r.invKw + ' كيلو — بطارية ' + resBatKwh(r.code) + ' كيلو — ' + resPanelText(r.code) +
      ' — السعر: ' + money(resTotalOf(r.code)) + ' $';
  }
  function resBrowseInvMsg() {
    return W(`تصفح المنظومات السكنية الجاهزة
  ${SEP}
  اختر قدرة الانفرتر من القائمة بالأسفل._`);
  }
  function resBrowseMsg() {
    var kw = resInvSel();
    return W(`المنظومات السكنية الجاهزة — انفرتر ${kw === null ? '' : kw} كيلو
  ${SEP}
  اختر المنظومة من القائمة بالأسفل لعرض التفاصيل._`);
  }

  // الإنتاج اليومي = عدد الألواح × قدرة اللوح بالوات × 5.5 ÷ 1000
  function dailyProductionFromItems(items) {
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i][0]).indexOf('panel:') === 0) {
        var panelW = parseFloat(String(items[i][0]).split(':')[1]) || 0;
        var panelCount = parseFloat(items[i][4]) || 0;
        total += panelCount * panelW * 5.5 / 1000;
      }
    }
    return Math.round(total * 100) / 100;
  }
  // الرنج = القيمة المذكورة في الإكسل (تُستخدم للترشيح فقط ولا تُعرض للعميل)
  // الإنتاج اليومي = عدد الألواح × قدرة اللوح × 5.5 ÷ 1000 (يُطبق على 1.6 و6.2 فقط)
  var RES_FORMULA_KW = [1.6, 6.2];
  for (var __ri = 0; __ri < RES_TABLE.length; __ri++) {
    var __r = RES_TABLE[__ri];
    __r.range = __r.daily; // الاحتفاظ بقيمة الرنج الأصلية من الإكسل
    if (RES_FORMULA_KW.indexOf(__r.invKw) !== -1) {
      __r.daily = dailyProductionFromItems(__r.items);
    }
  }

  var RES_BY_CODE = (function () { var o = {}; for (var i = 0; i < RES_TABLE.length; i++) { o[RES_TABLE[i].code] = RES_TABLE[i]; } return o; })();
  var RES_MAX_DAILY = (function () { var mx = 0; for (var i = 0; i < RES_TABLE.length; i++) { if (RES_TABLE[i].range > mx) { mx = RES_TABLE[i].range; } } return mx; })();
  var RES_QUOTE_NUM = (function () { var o = {}; for (var i = 0; i < RES_TABLE.length; i++) { o[RES_TABLE[i].code] = RES_TABLE[i].quote; } return o; })();
  var PDF_FILES = {}; // لا ملفات PDF جاهزة: كل عرض سعر سكني يُصدر من بنود الإكسل

  function resItemsOf(code) { var r = RES_BY_CODE[code]; return r ? r.items : []; }
  function resTotalOf(code) { var it = resItemsOf(code), g = 0; for (var i = 0; i < it.length; i++) { g += it[i][4] * it[i][5]; } return Math.round(g * 100) / 100; }
  function resPvKwp(code) { var it = resItemsOf(code), k = 0; for (var i = 0; i < it.length; i++) { if (String(it[i][0]).indexOf('panel:') === 0) { k += it[i][4] * (parseFloat(String(it[i][0]).split(':')[1]) || 0) / 1000; } } return Math.round(k * 1000) / 1000; }
  function resBatKwh(code) { var it = resItemsOf(code), k = 0; for (var i = 0; i < it.length; i++) { if (String(it[i][0]).indexOf('battery:') === 0) { k += it[i][4] * (parseFloat(String(it[i][0]).split(':')[1]) || 0); } } return Math.round(k * 100) / 100; }
  function resDailyOf(code) { var r = RES_BY_CODE[code]; return r ? r.daily : 0; }
  function resRangeOf(code) { var r = RES_BY_CODE[code]; return r ? r.range : 0; }

  // الاستهلاك اليومي المطلوب من قيمة الفاتورة الشهرية
  function resDailyNeed(yer) { var v = parseFloat(String(yer).replace(/,/g, '')); if (isNaN(v) || v <= 0) { return NaN; } return (v / KWH_PRICE) / 30; }

  // اختيار المنظومة الأقرب للرنج المطلوب (وإن تساوى القرب تُعرض كل الخيارات المتساوية)
  function resNearest(daily) {
    var best = null, out = [];
    for (var i = 0; i < RES_TABLE.length; i++) {
      // انفرتر 8 و12: لا تُقترح منظومة إنتاجها أقل من الاحتياج اليومي
      if ((RES_TABLE[i].invKw === 8 || RES_TABLE[i].invKw === 12) && RES_TABLE[i].range < daily - 0.0001) { continue; }
      var d = Math.abs(RES_TABLE[i].range - daily);
      if (best === null || d < best - 0.0001) { best = d; out = [RES_TABLE[i]]; }
      else if (Math.abs(d - best) <= 0.0001) { out.push(RES_TABLE[i]); }
    }
    if (!out.length) { return { diff: Infinity, list: [] }; }
    return { diff: best, list: out };
  }

  // خيارات الفاتورة كأزرار/قائمة كل معرف يقابل قيمة تمثيلية بالريال
  var BILL_OPTS = [
    ['b1', '0 - 7,000 ريال', 3000],
    ['b2', '7,001 - 15,000 ريال', 10000],
    ['b3', '15,001 - 20,000 ريال', 18000],
    ['b4', '20,001 - 40,000 ريال', 30000],
    ['b5', '40,001 - 80,000 ريال', 60000],
    ['b6', '80,001 - 120,000 ريال', 100000],
    ['b7', 'أكثر من 120,000 ريال', 200000]
  ];
  function billValue(t) {
    for (var bi = 0; bi < BILL_OPTS.length; bi++) {
      if (BILL_OPTS[bi][0] === t) { return BILL_OPTS[bi][2]; }
    }
    var v = parseFloat(String(t).replace(/,/g, ''));
    return isNaN(v) ? NaN : v;
  }

  function billAsk(kind) {
    var heads = {'1':' نظام سكني','2':' نظام تجاري','3':' نظام صناعي','4':' نظام زراعي'};
    return W(heads[kind] + '\n' + SEP + '\nكم الفاتورة الشهرية بالريال اليمني؟\nاكتب قيمة الفاتورة بالأرقام فقط _\nمثال: 15000_');
  }

  // تحديد نوع الاستهلاك للمسار السكني: فاتورة شهرية / كيلووات / ديزل
  function resMethodAsk() {
    return W(' نظام سكني\n' + SEP + '\nكم تدفع الفاتورة الشهرية بالريال اليمني؟\nادخل متوسط الفاتورة الشهرية التي تدفعها\nمثال: 43000\n\nأو تصفح المنظومات الجاهزة من الزر بالأسفل _');
  }
  function resValueAsk(method) {
    var mth = COM_METHOD_NAMES[method] || COM_METHOD_NAMES['1'];
    var hint = method === '2' ? 'اكتب الاستهلاك الشهري بالكيلووات بالأرقام فقط _\nمثال: 900_' : (method === '3' ? 'اكتب استهلاك الديزل باللتر شهرياً بالأرقام فقط _\nمثال: 250_' : 'اكتب قيمة الفاتورة بالأرقام فقط _\nمثال: 15000_');
    return W(' نظام سكني\n' + SEP + '\n *' + mth + '\n' + SEP + '\n' + hint);
  }

  function billToKwh(yer) {
    var v = parseFloat(yer);
    if (isNaN(v) || v < 0) { return NaN; }
    return v / KWH_PRICE;
  }

  function lookupByBill(yer, choice) {
    if (choice && choice !== '1') { return null; }
    var d = resDailyNeed(yer);
    if (isNaN(d)) { return null; }
    if (d > RES_MAX_DAILY + 0.0001) { return null; } // أعلى من أكبر منظومة سكنية -> يُحوّل للتجاري
    var pk = resNearest(d);
    var r = pk.list[0];
    if (!r) { return null; }
    var codes = [];
    for (var i = 0; i < pk.list.length; i++) { codes.push(pk.list[i].code); }
    return { name: r.name, code: r.code, daily: Math.round(d * 10) / 10, gen: r.daily, night: resBatKwh(r.code), ties: codes };
  }

  // المواصفات تُبنى آلياً من نفس بنود الإكسل حتى لا يحدث أي اختلاف بين الترشيح وعرض السعر
  var SPECS = (function buildSpecs() {
    var out = {};
    for (var i = 0; i < RES_TABLE.length; i++) {
      var r = RES_TABLE[i], pv = null, inv = null, bat = null, card = [], j;
      for (j = 0; j < r.items.length; j++) {
        var it = r.items[j], k = String(it[0]);
        if (k.indexOf('panel:') === 0 && !pv) { pv = it; }
        if (k.indexOf('inverter:') === 0 && !inv) { inv = it; }
        if (k.indexOf('battery:') === 0 && !bat) { bat = it; }
        card.push(it[1] + ' — ' + it[3] + (it[2] && it[2].length ? ' ))' + it[2].join(' / ') + '))' : ''));
      }
      out[r.code] = {
        volt: r.invKw === 1.6 ? '12 فولت' : '48 فولت',
        pv: pv ? (pv[1] + ' × ' + pv[4]) : '',
        inv: inv ? inv[1] : '',
        bat: bat ? (bat[1] + ' × ' + bat[4]) : '',
        pvShort: pv ? (pv[4] + '× (' + String(pv[0]).split(':')[1] + 'W)') : '',
        invShort: inv ? inv[1] : '',
        batShort: bat ? (resBatKwh(r.code) + ' كيلو') : '',
        card: [r.name].concat(card)
      };
    }
    return out;
  })();

  function specCard(code, sysName) {
    var sp = SPECS[code];
    var r = RES_BY_CODE[code];
    var t = '';
    if (sp && sp.card) {
      for (var i = 0; i < sp.card.length; i++) { t += sp.card[i] + '\n'; }
      if (r) {
        t += '\nعدد الألواح: ' + resPanelCount(code) + '\n';
        t += 'قدرة الانفرتر: ' + r.invKw + ' كيلو وات\n';
        t += 'سعة البطارية: ' + resBatKwh(code) + ' كيلو وات ساعة\n';
        t += 'رقم عرض السعر: ' + r.quote + '\n';
      }
      t += 'ضمان الألواح 25 سنة | ضمان البطاريات 5 سنوات\n';
    }
    return t;
  }

  var CABLE_NOTE = 'ملاحظة: كمية الكابل مذكورة بالمتر وهي تقديرية، ويتم تحديد الطول النهائي حسب طبيعة الموقع._';
  function money(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }


  // ===== قواعد أكتس المحدّثة: لوحات الحماية والكابلات والكنشات =====
  var ACTES_DC_PRICES = { 2: 80, 4: 230, 6: 450, 8: 530, 10: 630 };
  var ACTES_ACDC_DET = ['لوحات حماية سنجل فاز AC-DC-32AH-2WY', 'صندوق حماية بلاستيك 8 خط مقاوم للماء درجة الحماية IP65', 'قاطع حماية دخول الألواح DC — MCB DC 2P 500V 32A', 'قاطع خروج كهرباء AC-MCB-2P-32AH', '', 'صنف أصلي جديد'];
  function ACTES_DC_DET(sz) {
    var box = sz <= 8 ? 8 : 12;
    return [sz + ' خط',
      sz + ' مجموعات',
      'صندوق حماية بلاستيك ' + box + ' خط',
      'قواطع حماية دخول الألواح DC — MCB DC 2P 500V 32A',
      '',
      ''];
  }
  function ACTES_AC_DET(is3) {
    return is3
      ? ['3 فاز',
         'قاطع AC لدخول الكهرباء MCB 4P 63AH',
         'قاطع AC لخروج الكهرباء MCB 4P 63AH']
      : ['سنجل فاز',
         'قاطع AC لدخول الكهرباء MCB 2P 63AH',
         'قاطع AC لخروج الكهرباء MCB 2P 63AH'];
  }
  function ACTES_MC4_DET(mm) {
    return ['التركيب ومستلزمات توصيل MC4 - فور ' + mm + ' ملي',
      'جهد التحمل: 1000 فولت تيار مستمر | تيار التحمل: 30 أمبير',
      'درجة الحماية: IP68 مقاوم للماء والأتربة',
      'مقاومة تلامس منخفضة ومطابقة للمعايير العالمية'];
  }
  function actesDcSize(g) {
    g = Math.max(1, Math.ceil(Number(g) || 1));
    var sizes = [2, 4, 6, 8, 10];
    for (var i = 0; i < sizes.length; i++) { if (g <= sizes[i]) { return sizes[i]; } }
    return 10;
  }
  function actesNum(s, re) { var m = String(s || '').match(re); return m ? (parseFloat(m[1]) || 0) : 0; }
  function actesTxt(x) {
    var d = (x && x.details && x.details.join) ? x.details.join(' ') : '';
    return String((x && x.name) || '') + ' ' + d + ' ' + String((x && x.key) || '');
  }
  function actesFix(it, name, details, price, qty, unit) {
    it.name = name;
    it.details = details;
    it.price = price;
    if (qty !== undefined && qty !== null) { it.qty = qty; }
    if (unit) { it.unit = unit; }
    it.total = Math.round(it.qty * it.price * 100) / 100;
    return it;
  }
  // يطبّق القواعد الجديدة على قائمة بنود بصيغة {key,name,details,unit,qty,price,total}
  function actesNormalize(list, opts) {
    opts = opts || {};
    if (Object.prototype.toString.call(list) !== '[object Array]') { return list; }
    var items = [];
    for (var k = 0; k < list.length; k++) {
      var s = list[k];
      items.push({ key: s.key || '', name: s.name, details: s.details || [], unit: s.unit || 'حبة', qty: Number(s.qty) || 0, price: Number(s.price) || 0, total: Number(s.total) || ((Number(s.qty) || 0) * (Number(s.price) || 0)) });
    }
    var invKw = 0, is3 = !!opts.three, hv = !!opts.hv, panels = 0, groups = 0, strPer = 0;
    var iDc = -1, iAc = -1, iCable = -1, iMc4 = -1, i, it, t, boards = [];
    for (i = 0; i < items.length; i++) {
      it = items[i]; t = actesTxt(it);
      if (/انفرتر|انفيرتر|إنفرتر/.test(t)) {
        var kw = actesNum(t, /(\d+(?:\.\d+)?)\s*كيلو/);
        if (kw > invKw) { invKw = kw; }
        if (/ثري\s*فاز|3\s*فاز|ثلاثي/.test(t)) { is3 = true; }
        if (/جهد عالي/.test(t)) { hv = true; }
        continue;
      }
      if (/بطاري/.test(t)) { continue; }
      if (/لوح|ألواح|الواح/.test(t) && /شمسية|سنتك|طاقة/.test(t)) {
        panels += Number(it.qty) || 0;
        var g2 = actesNum(t, /عدد المجموعات:\s*(\d+)/);
        if (g2) { groups = g2; }
        var sp = actesNum(t, /(\d+)\s*لوح\/مجموعة/);
        if (sp) { strPer = sp; }
        continue;
      }
      if (/لوحة|صندوق|لوحات/.test(t) && /(تيار مستمر|تيار متردد|DC|AC|سنجل فاز|ثري فاز|حماية)/.test(t) && !/استند|حامل|هيكل|قاعدة/.test(t)) {
        boards.push(i);
        if (iDc < 0 && /(تيار مستمر|DC)/.test(t)) { iDc = i; } else if (iAc < 0) { iAc = i; }
        continue;
      }
      if (iCable < 0 && /كابل/.test(t) && /(مجلفن|الألواح|1500)/.test(t) && !/أرت|تأريض|فلكس/.test(t)) { iCable = i; continue; }
      if (iMc4 < 0 && /(كنشات|MC4)/.test(t)) { iMc4 = i; continue; }
    }
    if (!groups && iDc >= 0) {
      var dct = actesTxt(items[iDc]);
      groups = actesNum(String(items[iDc].key || ''), /dc:(\d+)/) || actesNum(dct, /(\d+)\s*مجموعات/) || actesNum(dct, /(\d+)\s*خط/);
    }
    // ---- لوحات الحماية (قاعدة موحدة لكل المسارات)
    if (boards.length) {
      var first = boards[0], newBoards = [], b;
      // جميع الأنظمة غير السكنية: لوحتان مستقلتان DC وAC دون استثناءات للقدرة أو نوع البطارية
      var sz = actesDcSize(groups || 2);
      var dp = ACTES_DC_PRICES[sz] || 630;
      newBoards.push({ key: '', name: 'لوحة حماية DC', details: ACTES_DC_DET(sz), unit: 'حبة', qty: 1, price: dp, total: dp });
      var ap = is3 ? 70 : 45;
      newBoards.push({ key: '', name: 'لوحة حماية AC', details: ACTES_AC_DET(is3), unit: 'حبة', qty: 1, price: ap, total: ap });
      if (newBoards.length) {
        var rebuilt = [];
        for (i = 0; i < items.length; i++) {
          if (i === first) { for (b = 0; b < newBoards.length; b++) { rebuilt.push(newBoards[b]); } continue; }
          if (boards.indexOf(i) >= 0) { continue; }
          rebuilt.push(items[i]);
        }
        items = rebuilt;
        iCable = -1; iMc4 = -1;
        for (i = 0; i < items.length; i++) {
          t = actesTxt(items[i]);
          if (iCable < 0 && /كابل/.test(t) && /(مجلفن|الألواح|1500)/.test(t) && !/أرت|تأريض|فلكس/.test(t)) { iCable = i; continue; }
          if (iMc4 < 0 && /(كنشات|MC4)/.test(t)) { iMc4 = i; }
        }
      }
    }
    // ---- الكابل والكنشات حسب عدد ألواح المجموعة
    var perGroup = strPer || (groups ? Math.ceil(panels / groups) : 0);
    if (perGroup > 0) {
      var big = perGroup > 5;
      var mm = big ? 10 : 6;
      var cprice = big ? 3 : 2.30;
      if (iCable >= 0) {
        actesFix(items[iCable], 'كابل نحاس مجلفن 1500 فولت مفرد ' + mm + ' مم', ['كابل نحاس مجلفن للطاقة الشمسية مفرد مقطع ' + mm + ' مم — صناعة تركية', 'جهد التحمل: 1500 فولت تيار مستمر', 'نوع PV1-F مقاوم للأشعة فوق البنفسجية والحرارة', 'موصل نحاس مجدول عالي النقاوة مع عزل مزدوج XLPE', 'درجة حرارة التشغيل: -40 إلى 90 درجة مئوية'], cprice, items[iCable].qty, items[iCable].unit || 'متر');
        items[iCable].key = 'cable';
      }
      var mcName = 'التركيب ومستلزمات توصيل MC4 - فور ' + mm + ' ملي';
      var mcQty = Math.max(1, groups || 1);
      if (iMc4 >= 0) {
        actesFix(items[iMc4], mcName, ACTES_MC4_DET(mm), items[iMc4].price || 2, mcQty, 'طقم');
      } else if (groups > 0) {
        var newMc = { key: 'acc:install', name: mcName, details: ACTES_MC4_DET(mm), unit: 'طقم', qty: mcQty, price: 2, total: mcQty * 2 };
        if (iCable >= 0) { items.splice(iCable + 1, 0, newMc); } else { items.push(newMc); }
      }
    }
    // ===== مستلزمات التركيب: سعرها صفر في الرسالة وملف PDF =====
    // أي بند إكسسوارات/كنشات/MC4/مستلزمات تركيب يُعامل كبند مضمّن،
    // لذلك لا يدخل سعره في الإجمالي النهائي.
    for (i = 0; i < items.length; i++) {
      var __accText = actesTxt(items[i]);
      var __accKey = String(items[i].key || '');
      if (/^(?:accessories$|acc[:]|mc4)/i.test(__accKey) || /إكسسوارات|اكسسوارات|مستلزمات\s*التركيب|التركيب ومستلزمات توصيل|كنشات|MC4/i.test(__accText)) {
        items[i].price = 0;
        items[i].total = 0;
      }
    }
    return items;
  }
  // ===== توحيد أسماء الأصناف وترتيبها بين رسالة عرض السعر النصية وملف الـ PDF =====
  function actesPanelWatt(t) {
    var m = String(t || '').match(/(\d{3,4})\s*[:\s]*\s*(?:وات|واط|wp\b|w\b)/i);
    return m ? parseInt(m[1], 10) : 0;
  }
  function actesIsPanel(t, k) {
    return /^panel[:]/i.test(String(k || '')) || /[أا]لواح\s*(?:طاقة|شمسية)|لوح\s*طاقة/.test(String(t || ''));
  }
  // اسم صنف الألواح بالصيغة المعتمدة
  function actesPanelTitle(t) {
    var wp = actesPanelWatt(t);
    if (!wp) { return ''; }
    if (wp === 595) { return 'الواح طاقة شمسية ماركة سنتك بقدرة 595W'; }
    if (wp === 720) { return 'الواح طاقة شمسية ماركة سنتك بقدرة 720W'; }
    return 'ألواح طاقة شمسية ماركة سنتك بقدرة ' + wp + 'W';
  }
  // الوصف الكامل للألواح: الاسم المعتمد ثم بقية المواصفات
  function actesPanelDesc(t) {
    var title = actesPanelTitle(t);
    if (!title) { return String(t || ''); }
    var segs = String(t || '').split(' | ');
    while (segs.length && /ماركة\s*سنتك|[أا]لواح\s*طاقة|^\s*شمسية|قدرة\s*اللوح/.test(segs[0])) { segs.shift(); }
    return segs.length ? (title + ' | ' + segs.join(' | ')) : title;
  }
  function actesTxtOf(x) { return String((x && (x.description || x.name)) || ''); }
  function actesCatOf(it) {
    var t = actesTxtOf(it), k = String((it && it.key) || '');
    var board = /لوح(?:ة|ات)?\s*حماية|صندوق\s*(?:حماية|تجميع)/.test(t) && !/استند|حامل|هيكل|قاعدة/.test(t);
    if (board) { return (/تيار\s*مستمر|\bDC\b/.test(t) && !/تيار\s*متردد|\bAC\b/.test(t)) ? 4 : 5; }
    if (actesIsPanel(t, k)) { return 1; }
    if (/^inverter[:]/i.test(k) || /انفرتر|انفيرتر|إنفرتر/.test(t)) { return 2; }
    if (/^(battery|ess)[:]/i.test(k) || /بطاري/.test(t)) { return 3; }
    return 6;
  }
  // اسم الصنف كما يظهر في الـ PDF (بدون مواصفات)
  function actesShortName(it) {
    var c = actesCatOf(it);
    if (c === 4) { return 'لوحة حماية DC'; }
    if (c === 5) { return 'لوحة حماية AC'; }
    var t = actesTxtOf(it);
    if (c === 1) { var p = actesPanelTitle(t); if (p) { return p; } }
    return String(t).split(' | ')[0].split(' /')[0].trim();
  }
  // ترتيب البنود: الألواح ثم الانفرتر ثم البطاريات ثم لوحة DC ثم لوحة AC ثم البقية
  function actesOrderItems(list) {
    var arr = [], seenAc = false, i;
    for (i = 0; i < list.length; i++) {
      var it = list[i], c = actesCatOf(it);
      if (c === 5) { if (seenAc) { continue; } seenAc = true; }
      arr.push({ it: it, c: c, i: i });
    }
    arr.sort(function (a, b) {
      // ترتيب إلزامي لأول 3 أصناف: 1) الألواح 2) الانفرتر 3) البطارية، ثم باقي البنود.
      var pa = (a.c === 1 ? 1 : a.c === 2 ? 2 : a.c === 3 ? 3 : 4);
      var pb = (b.c === 1 ? 1 : b.c === 2 ? 2 : b.c === 3 ? 3 : 4);
      return (pa - pb) || (a.c - b.c) || (a.i - b.i);
    });
    var out = [];
    for (i = 0; i < arr.length; i++) { out.push(arr[i].it); }
    return out;
  }


  // اسم الصنف في الرسالة النصية: الألواح والانفرتر والبطاريات بقدرتها فقط
  function actesNumOf(t) {
    var s = String(t || '');
    var m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:كيلو\s*وات\s*ساعة|كيلووات\s*ساعة|كيلو\s*واط\s*ساعة|كيلو\s*وات|كيلووات|كيلو\s*واط|كيلو|kwh|kw)\b/i);
    return m ? m[1].replace(',', '.') : '';
  }
  function actesJoinedText(it) {
    var parts = [];
    if (it) {
      if (it.description != null) { parts.push(String(it.description)); }
      if (it.name != null) { parts.push(String(it.name)); }
      if (Array.isArray(it.details)) {
        for (var di = 0; di < it.details.length; di++) {
          if (it.details[di] != null) { parts.push(String(it.details[di])); }
        }
      }
    }
    return parts.join(' | ');
  }
  function actesFirstNonEmpty() {
    for (var ai = 0; ai < arguments.length; ai++) {
      var av = String(arguments[ai] == null ? '' : arguments[ai]).trim();
      if (av) { return av; }
    }
    return '';
  }
  function actesExtractInverterKw(key, fullText) {
    var k = String(key || '');
    var s = String(fullText || '');
    // 1) مفتاح البند، مثل inverter:8:1 أو inverter:50:3:deye
    var m = k.match(/^inverter\s*:\s*(\d+(?:[.,]\d+)?)/i);
    if (m) { return m[1].replace(',', '.'); }
    // 2) ابحث في كل الاسم + التفاصيل، وليس الجزء الأول فقط.
    var patterns = [
      /(?:قدرة\s*(?:خرج\s*)?|قدرة\s*الانفرتر\s*|خرج\s*الانفرتر\s*)?(\d+(?:[.,]\d+)?)\s*(?:كيلو\s*وات|كيلووات|كيلو\s*واط|kW)\b/i,
      /(?:انفرتر|انفيرتر|إنفرتر)[^0-9]{0,40}(\d+(?:[.,]\d+)?)\s*(?:kW|كيلو(?:\s*وات|وات|\s*واط|))\b/i,
      /\bSUN[-_]?([0-9]+(?:[.,]\d+)?)K\b/i
    ];
    for (var pi = 0; pi < patterns.length; pi++) {
      var mm = s.match(patterns[pi]);
      if (mm) {
        var n = parseFloat(String(mm[1]).replace(',', '.'));
        if (isFinite(n) && n > 0) { return String(n); }
      }
    }
    // 3) أحياناً الاسم يحتوي 8000W بدلاً من 8kW.
    var mw = s.match(/(?:انفرتر|انفيرتر|إنفرتر)[^0-9]{0,40}(\d+(?:[.,]\d+)?)\s*W\b/i);
    if (mw) {
      var wn = parseFloat(String(mw[1]).replace(',', '.'));
      if (isFinite(wn) && wn > 0) { return String(wn >= 1000 ? wn / 1000 : wn); }
    }
    return '';
  }
  function actesExtractBatteryKwh(key, fullText) {
    var k = String(key || '');
    var s = String(fullText || '');
    // 1) المفتاح: battery:16 أو battery:5.12 أو ess:rack:61.5 أو ess:cab:112
    var m = k.match(/^battery\s*:\s*(\d+(?:[.,]\d+)?)/i);
    if (m) { return m[1].replace(',', '.'); }
    var me = k.match(/^ess\s*:\s*(?:rack|cab)\s*:\s*(\d+(?:[.,]\d+)?)/i);
    if (me) { return me[1].replace(',', '.'); }
    // 2) ابحث في الاسم والتفاصيل كلها، مع أولوية kWh / كيلو وات ساعة.
    var mk = s.match(/(\d+(?:[.,]\d+)?)\s*(?:كيلو\s*وات\s*ساعة|كيلووات\s*ساعة|كيلو\s*واط\s*ساعة|kWh)(?![a-z])/i);
    if (mk) { return mk[1].replace(',', '.'); }
    // 3) بعض بيانات ACTES القديمة تكتب "16 كيلو وات" وتقصد سعة البطارية.
    var mb = s.match(/(?:بطارية|بايلونتك|pylontech|fidus|hthium|heroee)[^0-9]{0,120}(\d+(?:[.,]\d+)?)\s*(?:كيلو\s*وات|كيلووات|كيلو\s*واط|كيلو)(?![a-z])/i);
    if (mb) { return mb[1].replace(',', '.'); }
    // 4) إذا كانت السعة فقط بالـWh، حوّلها إلى kWh.
    var mw = s.match(/(?:السعة\s*(?:الاسمية|القابلة\s*للاستخدام)?[^0-9]*)?(\d+(?:[.,]\d+)?)\s*Wh\b/i);
    if (mw) {
      var whNum = parseFloat(String(mw[1]).replace(',', '.'));
      if (isFinite(whNum) && whNum > 100) { return String(Math.round((whNum / 1000) * 1000) / 1000); }
    }
    return '';
  }
  // اسم الصنف في رسالة واتساب: الصنف + القدرة/السعة الحقيقية من المفتاح أو كل التفاصيل.
  function actesMsgName(it) {
    var c = actesCatOf(it);
    var fullText = actesJoinedText(it);
    var base = actesFirstNonEmpty(it && it.description, it && it.name)
      .split(' | ')[0].split(' /')[0].trim();
    var key = String((it && it.key) || '');

    if (c === 1) {
      var wp = actesPanelWatt(fullText);
      if (wp) { return 'ألواح طاقة شمسية ماركة سنتك بقدرة ' + wp + 'W'; }
    }

    if (c === 2) {
      var invKw = actesExtractInverterKw(key, fullText);
      if (invKw) {
        base = base.replace(/\s+(?:\d+(?:[.,]\d+)?)\s*(?:كيلو\s*وات|كيلووات|كيلو\s*واط|كيلو|kW)\b/i, '').trim();
        return base + ' بقدرة ' + invKw + 'kW';
      }
    }

    if (c === 3) {
      var batKwh = actesExtractBatteryKwh(key, fullText);
      if (batKwh) {
        base = base.replace(/\s+(?:\d+(?:[.,]\d+)?)\s*(?:كيلو\s*وات\s*ساعة|كيلووات\s*ساعة|كيلو\s*واط\s*ساعة|كيلو\s*وات|كيلووات|كيلو\s*واط|كيلو|kWh)\b/i, '').trim();
        return base + ' بسعة ' + batKwh + 'kWh';
      }
    }

    if (c === 4) { return 'لوحة حماية DC'; }
    if (c === 5) { return 'لوحة حماية AC'; }
    if ((c === 6 || c === 98 || /^accessories$|^(?:acc[:]|mc4)/i.test(key)) &&
        /(كنشات|MC4|التركيب ومستلزمات توصيل|إكسسوارات|مستلزمات)/i.test(fullText)) {
      var mmMatch = fullText.match(/(?:فور|4MC|MC4)[^0-9]*(\d+)\s*ملي/i);
      return mmMatch ? 'التركيب ومستلزمات توصيل MC4 - فور ' + mmMatch[1] + ' ملي' : 'التركيب ومستلزمات توصيل MC4';
    }
    return base;
  }

  // ملخص المنتجات للرسالة التالية للـ PDF ورسالة المنظومة المناسبة.
  // الأسماء والقدرات والكميات مأخوذة حصراً من بنود العرض الموجودة في البوت.
  function quoteProductsSummary(list) {
    var ordered = actesOrderItems(list || []);
    var labels = { 1: 'الألواح', 2: 'الانفرتر', 3: 'البطارية' };
    var found = {}, lines = [];
    for (var i = 0; i < ordered.length; i++) {
      var it = ordered[i], cat = actesCatOf(it);
      if (!labels[cat] || found[cat]) { continue; }
      found[cat] = true;
      lines.push(labels[cat]);
      lines.push(actesMsgName(it));
      lines.push('الكمية: ' + it.qty + ' ' + (it.unit || 'حبة'));
      lines.push('');
    }
    return 'أكتس لإستيراد أنظمة الطاقة\n\n        المنظومة المناسبة لك\n\n' + lines.join('\n').replace(/\n+$/, '');
  }
  function quoteAfterPdf(list) {
    var ordered = actesOrderItems(list || []);
    var lines = [];
    var grand = 0;
    lines.push('عرض السعر');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    for (var i = 0; i < ordered.length; i++) {
      var it = ordered[i];
      var qty = Number(it.qty) || 0;
      var unitPrice = Number(it.price) || 0;
      var total = Number(it.total);
      if (!isFinite(total)) { total = qty * unitPrice; }
      grand += total;
      lines.push((i + 1) + '. ' + actesMsgName(it));
      lines.push('الكمية: ' + it.qty + ' ' + (it.unit || 'حبة'));
      lines.push('سعر الوحدة: ' + money(unitPrice) + ' $');
      lines.push('الإجمالي: ' + money(total) + ' $');
      lines.push('━━━━━━━━━━━━━━━━━━━━');
    }
    lines.push('الإجمالي الكلي: ' + money(Math.round(grand * 100) / 100) + ' $');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('أرسل 0 للعودة إلى البداية');
    return lines.join('\n');
  }

  // نص عرض السعر بنفس ترتيب وبنود ملف الـ PDF تماماً ولكن بدون مواصفات
  function plainQuoteText(list, cname) {
    var ordered = actesOrderItems(list || []);
    var out = '';
    out += '📋 عرض السعر\n';
    out += '━━━━━━━━━━━━━━━━━━━━\n';
    out += 'العميل: ' + (cname && cname !== '-' ? cname : '...........') + '\n\n';
    var g = 0;
    for (var i = 0; i < ordered.length; i++) {
      var it = ordered[i];
      var tot = Number(it.total) || (Number(it.qty) * Number(it.price));
      g += tot;
      out += (i + 1) + '. ' + actesMsgName(it) + '\n';
      out += 'الكمية: ' + it.qty + ' ' + (it.unit || 'حبة') + '\n';
      out += 'سعر الوحدة: ' + money(it.price) + ' $\n';
      out += 'الإجمالي: ' + money(tot) + ' $\n';
      if (i !== ordered.length - 1) { out += '━━━━━━━━━━━━━━━━━━━━\n'; }
    }
    __quote_total = Math.round(g * 100) / 100;
    out += '━━━━━━━━━━━━━━━━━━━━\n';
    out += '💰 الإجمالي الكلي: ' + money(Math.round(g * 100) / 100) + ' $\n';
    return out;
  }

  function itemLine(n, title, details, qtyLabel, qtyNum, unitPrice, last) {
    var total = qtyNum * unitPrice;
    var t = '' + title + '';
    if (details.length) { t += ' _' + details.join(' - ') + '_'; }
    t += '\n';
    t += 'الكمية: ' + qtyLabel + ' | السعر: ' + money(unitPrice) + ' $ | الإجمالي: ' + money(total) + ' $\n';
    t += last ? '' : '_________\n';
    return t;
  }

  // بنود عرض السعر السكني (تُرسل لبناء ملف PDF بنفس مسار الأصناف)
  function resQuoteItems(code) {
    var it = resItemsOf(code), out = [];
    for (var i = 0; i < it.length; i++) {
      var mm = String(it[i][3]).match(/^([\d.,]+)\s*(.*)$/);
      var unitLbl = (mm && mm[2]) ? mm[2] : 'حبة';
      var itemKey = it[i][0];
      var itemName = String(it[i][1] || '');
      var itemDetails = it[i][2] || [];
      // مفتاح مستقل للاستاند يمنع كلمة «لوحة» من مطابقته خطأً مع الألواح الشمسية.
      if (!itemKey && /استند|استاند/.test(itemName)) {
        itemKey = 'stand:residential';
        var smallInv = RES_BY_CODE[code] && Number(RES_BY_CODE[code].invKw) < 3;
        var acAmp = smallInv ? '10 أمبير' : '32 أمبير';
        itemDetails = [
          'استاند حديد مطلي مقاوم للصدأ',
          'لوحة حماية DC بلاستيك 12 خط مقاومة للماء',
          'قاطع دخول الألواح DC نوع MCB ثنائي القطب 32 أمبير',
          'فيوز DC مع الحافظة 32 أمبير / 1000 فولت — عدد 2',
          'لوحة حماية AC',
          'قاطع دخول الكهرباء AC نوع MCB ثنائي القطب ' + acAmp,
          'قاطع خروج الانفرتر AC نوع MCB ثنائي القطب ' + acAmp,
          ''
        ];
      }
      out.push({ key: itemKey, name: itemName, details: itemDetails, unit: unitLbl, qty: it[i][4], price: it[i][5], total: Math.round(it[i][4] * it[i][5] * 100) / 100 });
    }
    var rr = RES_BY_CODE[code];
    return (rr && Number(rr.invKw) >= 8) ? actesNormalize(out, {}) : out; // قواعد الحماية تبدأ من انفرتر 8 كيلووات
  }

  function quoteText(code, cname, sysName) {
    return plainQuoteText(resQuoteItems(code), cname);
  }

  // اعتماد منظومة سكنية معيّنة وعرض بطاقتها
  function resApplySelected(code) {
    var r = RES_BY_CODE[code];
    if (!r) { return false; }
    system_type = code;
    inv_pick = PKG_IMG[code] || null;
    inv_pick_line = SPECS[code] ? SPECS[code].invShort : '';
    step = 'res_quote_ask';
    response = billResult({ code: code, name: r.name }, '1');
    return true;
  }

  // رسالة اختيار بين منظومتين متساويتين في القرب من استهلاك العميل
  function resTieAsk(list, daily) {
    var t = ' منظومات مناسبة لاستهلاكك\n' + SEP + '\n';
    for (var i = 0; i < list.length; i++) {
      t += '— ' + resOptionTitle(list[i]) + '\n';
      t += resOptionDescription(list[i]) + '\n\n';
    }
    t += 'اختر المنظومة المناسبة من الأزرار بالأسفل._';
    return W(t);
  }
  function resTieList() {
    var d = resDailyNeed(monthly_consumption);
    if (isNaN(d)) { return []; }
    return resNearest(d).list;
  }

  // استهلاك أعلى من أكبر منظومة سكنية -> تحويل تلقائي لمسار التجاري
  function resToCommercial(billYer) {
    menu_choice = '2';
    activity_type = 'com_1';
    monthly_consumption = String(billYer);
    peak_load = String(Math.round((billYer / KWH_PRICE) * 100) / 100);
    var head = W(' استهلاكك أعلى من أكبر منظومة سكنية لدينا\n' + SEP +
      '\nالاستهلاك التقديري: ' + (Math.round(resDailyNeed(billYer) * 10) / 10) + ' كيلو وات / يوم' +
      '\nسننقلك إلى منظومات التجاري الأنسب لاستهلاكك._');
    if (!comInvOptions().length) { step = 'done'; response = comNoInvOfferEscalate(); }
    else { step = 'com_inv_ask'; response = head + '\n\n' + comInvAsk(); }
  }

  var MSG = {
    menu_ar: 'أكتس لأنظمة الطاقة وحلولها\n' + SEP + '\nاختر الزر المناسب لطلبك\n\n' + '1 — السكني والتجاري والصناعي\n2 — عبر دراسة PVsyst\n' + SEP,
    menu_en: '*ACTES Energy Solutions*\n' + SEP + '\nChoose the button that matches your request\n\n' + '1 — Residential / Commercial / Industrial\n2 — Via PVsyst Study\n' + SEP,
    invalid_ar: W(' خيار غير صحيح. يرجى إرسال رقم صحيح من القائمة._'),
    invalid_en: W(' _Invalid option. Please send a valid number from the menu._'),
    invalid_num_ar: W(' يرجى إدخال رقم صحيح._'),
    invalid_num_en: W(' _Please enter a valid number._'),
    not_understood_ar: W(' عذراً، لم نفهم قصدك._\nيرجى الاختيار من الخيارات أدناه فقط _'),
    not_understood_en: W(' _Sorry, we did not understand you._\n_Please choose only from the options below _'),
    city_ar: W(' يرجى إدخال اسم المدينة:_'),
    city_en: W(' _Please enter your city:_'),
    text_only_ar: W(' يرجى إرسال النص فقط._'),
    text_only_en: W(' _Please send text only._'),
    back_ar: 'أرسل 0 للعودة إلى البداية._\n' + SEP,
    back_en: '_Send 0 to return to the beginning._\n' + SEP,
    quote_ask_ar: W(' هل ترغب في طلب عرض سعر؟\n\nاختر من الأزرار التالية _'),
    quote_ask_en: W(' *Would you like to request a quotation?*\n\n_Choose from the buttons below _'),
    quote_next_ar: W('دراسة PVsyst\nمخطط SLD\nمتابعة الشراء\nالعودة خطوة'),
    quote_next_en: W(' *Next step*\n\n_Choose from the options below_'),
    no_quote_ar: W(' شكراً لتواصلك مع ' + AC + '!*\n\nتم تجهيز تصميم المنظومة المبدئي._\n\nأرسل 0 للعودة إلى البداية._'),
    no_quote_en: W(' *Thank you for contacting ' + AC + '!*\n\n_Preliminary system design noted._\n\n_Send 0 to return to the beginning._'),
    ask_name_ar: W(' لإتمام إعداد عرض السعر\n\nيرجى إدخال اسم العميل. وإذا كان الاسم المسجل في طلبك السابق صحيحاً، يمكنك اختياره من الزر أدناه:_'),
    ask_name_en: W(' *To prepare your quotation*\n\n_Please enter your name:_'),
    contact_ok_ar: W(' تم تسجيل طلبك بنجاح!*\n\nسيتواصل معك فريق ' + AC + ' قريباً._\n\nأرسل 0 للعودة إلى البداية._'),
    contact_ok_en: W(' *Your request has been registered!*\n\n_The ' + AC + ' team will contact you soon._\n\n_Send 0 to return to the beginning._')
  };

  function m(key) { return lang !== 'en' ? MSG[key + '_ar'] : MSG[key + '_en']; }
  function noOpt(again) {
    var head = (lang === 'en')
      ? W(' *Sorry, we did not understand your choice*\n_Please choose only from the available options._')
      : W(' عذراً لم نفهم اختيارك\nيرجى الاختيار من الخيارات المتاحة فقط._');
    return head + '\n\n' + (again || '');
  }
  function mainMenu() { return m('menu'); }
  function textOnly() { return m('text_only'); }

  var INV_NAME = 'انفرتر 8 كيلو';
  var PANEL_W = 720;
  // قاعدة أحجام المحولات والألواح الشمسية (كاملة)
  // panels: عدد الألواح | pv: القدرة الكلية ك.و | daily: الإنتاج اليومي ك.و
  // bat: البطاريات المطلوبة ك.و | night: إنتاج الليل | day: إنتاج النهار
  // inv: اسم المحول | kw: حجم المحول | code: مفتاح عرض السعر
  var INV_TABLE = [
    { kw: 8, inv: 'انفرتر 8 كيلو', code: 'p8', panels: 8, pv: 5.76, daily: 31.68, bat: 16, night: 14.4, day: 17.28 },
    { kw: 8, inv: 'انفرتر 8 كيلو', code: 'p9', panels: 9, pv: 6.48, daily: 35.64, bat: 16, night: 14.4, day: 21.24 },
    { kw: 8, inv: 'انفرتر 8 كيلو', code: 'p14', panels: 14, pv: 10.08, daily: 55.44, bat: 32, night: 28.8, day: 26.64 },
    { kw: 8, inv: 'انفرتر 8 كيلو', code: 'p16', panels: 16, pv: 11.52, daily: 63.36, bat: 32, night: 28.8, day: 34.56 },
    { kw: 8, inv: 'انفرتر 8 كيلو', code: 'p18', panels: 18, pv: 12.96, daily: 71.28, bat: 32, night: 28.8, day: 42.48 },
    { kw: 12, inv: 'انفرتر 12 كيلو', code: 'i12p9', panels: 9, pv: 6.48, daily: 35.64, bat: 16, night: 14.4, day: 21.24 },
    { kw: 12, inv: 'انفرتر 12 كيلو', code: 'i12p18', panels: 18, pv: 12.96, daily: 71.28, bat: 32, night: 28.8, day: 42.48 },
    { kw: 12, inv: 'انفرتر 12 كيلو', code: 'i12p21', panels: 21, pv: 15.12, daily: 83.16, bat: 32, night: 28.8, day: 54.36 },
    { kw: 12, inv: 'انفرتر 12 كيلو', code: 'i12p27', panels: 27, pv: 19.44, daily: 106.92, bat: 48, night: 43.2, day: 63.72 },
    { kw: 16, inv: 'انفرتر 16 كيلو', code: 'i16p18', panels: 18, pv: 12.96, daily: 71.28, bat: 32, night: 28.8, day: 42.48 },
    { kw: 16, inv: 'انفرتر 16 كيلو', code: 'i16p21', panels: 21, pv: 15.12, daily: 83.16, bat: 32, night: 28.8, day: 54.36 },
    { kw: 16, inv: 'انفرتر 16 كيلو', code: 'i16p24', panels: 24, pv: 17.28, daily: 95.04, bat: 48, night: 43.2, day: 51.84 },
    { kw: 16, inv: 'انفرتر 16 كيلو', code: 'i16p36', panels: 36, pv: 25.92, daily: 142.56, bat: 48, night: 43.2, day: 99.36 },
    { kw: 12, inv: 'انفرتر 12 كيلو 3 فاز', code: 'i12t9', panels: 9, pv: 6.48, daily: 35.64, bat: 16, night: 14.4, day: 21.24, phase3: true },
    { kw: 12, inv: 'انفرتر 12 كيلو 3 فاز', code: 'i12t18', panels: 18, pv: 12.96, daily: 71.28, bat: 32, night: 28.8, day: 42.48, phase3: true },
    { kw: 12, inv: 'انفرتر 12 كيلو 3 فاز', code: 'i12t21', panels: 21, pv: 15.12, daily: 83.16, bat: 32, night: 28.8, day: 54.36, phase3: true },
    { kw: 12, inv: 'انفرتر 12 كيلو 3 فاز', code: 'i12t27', panels: 27, pv: 19.44, daily: 106.92, bat: 48, night: 43.2, day: 63.72, phase3: true },
    { kw: 16, inv: 'انفرتر 16 كيلو 3 فاز', code: 'i16t26', panels: 26, pv: 18.72, daily: 102.96, bat: 48, night: 43.2, day: 59.76, phase3: true },
    { kw: 16, inv: 'انفرتر 16 كيلو 3 فاز', code: 'i16t30', panels: 30, pv: 21.6, daily: 118.8, bat: 48, night: 43.2, day: 75.6, phase3: true },
    { kw: 16, inv: 'انفرتر 16 كيلو 3 فاز', code: 'i16t33', panels: 33, pv: 23.76, daily: 130.68, bat: 48, night: 43.2, day: 87.48, phase3: true },
    { kw: 16, inv: 'انفرتر 16 كيلو 3 فاز', code: 'i16t36', panels: 36, pv: 25.92, daily: 142.56, bat: 48, night: 43.2, day: 99.36, phase3: true },
    { kw: 20, inv: 'انفرتر 20 كيلو 3 فاز', code: 'i20t30', panels: 30, pv: 21.6, daily: 118.8, bat: 48, night: 43.2, day: 75.6, phase3: true },
    { kw: 20, inv: 'انفرتر 20 كيلو 3 فاز', code: 'i20t33', panels: 33, pv: 23.76, daily: 130.68, bat: 48, night: 43.2, day: 87.48, phase3: true },
    { kw: 20, inv: 'انفرتر 20 كيلو 3 فاز', code: 'i20t39', panels: 39, pv: 28.08, daily: 154.44, bat: 64, night: 57.6, day: 96.84, phase3: true },
    { kw: 20, inv: 'انفرتر 20 كيلو 3 فاز', code: 'i20t52', panels: 52, pv: 37.44, daily: 205.92, bat: 64, night: 57.6, day: 148.32, phase3: true },
  ];

  // تطبيق نفس معادلة الإنتاج اليومي على جميع المنظومات التجارية
  for (var __ii = 0; __ii < INV_TABLE.length; __ii++) {
    INV_TABLE[__ii].daily = Math.round((INV_TABLE[__ii].panels * PANEL_W * 5.5 / 1000) * 100) / 100;
  }

  // عروض السعر الجاهزة (PDF) للمسار التجاري انفرتر 8 كيلو
  var COM_QUOTES = {
    'p8': { num: 'ACTES-631', total: '4,018.70', url: 'https://files.catbox.moe/0gtzgl.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '8 الواح', '130.00', '1,040.00'],
      ['انفرتر دايا هايبرد DEYE', ['8 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-8K-SG01LP1-EU'], '1 حبة', '1,100.00', '1,100.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم هيثيوم HTHIUM', ['16 كيلو وات 51.2 فولت', 'الموديل: HeroEE 16', 'السعة 16076.8 Wh | 314 Ah | DOD 90%', 'الشحن/التفريغ الموصى به 100A | الحد الأقصى 200A', 'جهد الشحن/التفريغ 43.2~58.4V | 11000 دورة', '110 kg | 520×240×781.2 mm | IP30'], '1 حبة', '1,800.00', '1,800.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 10 مم'], '1 متر', '2.70', '2.70'],
      ['كنشات توصيل MC4', ['فور 10 ملي'], '3 طقم', '2.00', '6.00']
    ]},
    'p9': { num: 'ACTES-674', total: '4,209.00', url: 'https://files.catbox.moe/xt8fu3.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '9 الواح', '130.00', '1,170.00'],
      ['انفرتر دايا هايبرد DEYE', ['8 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-8K-SG01LP1-EU'], '1 حبة', '1,100.00', '1,100.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '1 حبة', '1,800.00', '1,800.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'p14': { num: 'ACTES-671', total: '6,659.00', url: 'https://files.catbox.moe/mru6zr.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '14 الواح', '130.00', '1,820.00'],
      ['انفرتر دايا هايبرد DEYE', ['8 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-8K-SG01LP1-EU'], '1 حبة', '1,100.00', '1,100.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'p16': { num: 'ACTES-673', total: '6,919.00', url: 'https://files.catbox.moe/r52309.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '16 الواح', '130.00', '2,080.00'],
      ['انفرتر دايا هايبرد DEYE', ['8 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-8K-SG01LP1-EU'], '1 حبة', '1,100.00', '1,100.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'p18': { num: 'ACTES-672', total: '7,179.00', url: 'https://files.catbox.moe/6f0p3q.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '18 الواح', '130.00', '2,340.00'],
      ['انفرتر دايا هايبرد DEYE', ['8 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-8K-SG01LP1-EU'], '1 حبة', '1,100.00', '1,100.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i12p9': { num: 'ACTES-676', total: '4,909.00', url: 'https://files.catbox.moe/hbly71.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '9 الواح', '130.00', '1,170.00'],
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU-AM3'], '1 حبة', '1,800.00', '1,800.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '1 حبة', '1,800.00', '1,800.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i12p18': { num: 'ACTES-677', total: '7,879.00', url: 'https://files.catbox.moe/x50u2o.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '18 الواح', '130.00', '2,340.00'],
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU-AM3'], '1 حبة', '1,800.00', '1,800.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i12p21': { num: 'ACTES-678', total: '8,279.00', url: 'https://files.catbox.moe/9igthz.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '21 الواح', '130.00', '2,730.00'],
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU-AM3'], '1 حبة', '1,800.00', '1,800.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i12p27': { num: 'ACTES-678', total: '10,859.00', url: 'https://files.catbox.moe/3pokrh.pdf', items: [
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '27 الواح', '130.00', '3,510.00'],
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU-AM3'], '1 حبة', '1,800.00', '1,800.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i16p18': { num: 'ACTES-679', total: '6,279.00', url: 'https://files.catbox.moe/m0sjka.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU'], '1 حبة', '2,000.00', '2,000.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '18 الواح', '130.00', '2,340.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '1 حبة', '1,800.00', '1,800.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i16p21': { num: 'ACTES-680', total: '8,479.00', url: 'https://files.catbox.moe/wxcw22.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU'], '1 حبة', '2,000.00', '2,000.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '21 الواح', '130.00', '2,730.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i16p24': { num: 'ACTES-681', total: '10,669.00', url: 'https://files.catbox.moe/0fo67w.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU'], '1 حبة', '2,000.00', '2,000.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '24 الواح', '130.00', '3,120.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i16p36': { num: 'ACTES-682', total: '12,229.00', url: 'https://files.catbox.moe/x7gojd.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت سنجل فاز', 'الموديل: SUN-12K-SG01LP1-EU'], '1 حبة', '2,000.00', '2,000.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '36 الواح', '130.00', '4,680.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية سنجل فاز', ['موديل: AC-MCB-2P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '35.00', '35.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '2.30', '69.00']
    ]},
    'i12t9': { num: 'ACTES-683', total: '4,795.00', url: 'https://files.catbox.moe/fcehs2.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-12K-SG04LP3-EU'], '1 حبة', '1,650.00', '1,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '9 الواح', '130.00', '1,170.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '1 حبة', '1,800.00', '1,800.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '3.00', '90.00']
    ]},
    'i12t18': { num: 'ACTES-684', total: '7,765.00', url: 'https://files.catbox.moe/t4ipg0.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-12K-SG04LP3-EU'], '1 حبة', '1,650.00', '1,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '18 الواح', '130.00', '2,340.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['لوحة حماية تيار مستمر 2 مجموعات', ['صندوق تجميع | عدد المجموعات: 2', 'قاطع MCB 2P 32AH DC عدد 2 | فيوز مع الحافظة 1000V DC 32AH عدد 4'], '1 حبة', '35.00', '35.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '30 متر', '3.00', '90.00']
    ]},
    'i12t21': { num: 'ACTES-685', total: '8,345.00', url: 'https://files.catbox.moe/x82phx.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-12K-SG04LP3-EU'], '1 حبة', '1,650.00', '1,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '21 الواح', '130.00', '2,730.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '2 حبة', '1,800.00', '3,600.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '3.00', '270.00']
    ]},
    'i12t27': { num: 'ACTES-686', total: '10,925.00', url: 'https://files.catbox.moe/a0kpeh.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['12 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-12K-SG04LP3-EU'], '1 حبة', '1,650.00', '1,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '27 الواح', '130.00', '3,510.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '3.00', '270.00']
    ]},
    'i16t26': { num: 'ACTES-687', total: '11,795.00', url: 'https://files.catbox.moe/vjv0h1.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-16K-SG05LP3-EU-SM2'], '1 حبة', '2,650.00', '2,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '26 الواح', '130.00', '3,380.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '3.00', '270.00']
    ]},
    'i16t30': { num: 'ACTES-688', total: '12,315.00', url: 'https://files.catbox.moe/k82o2c.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-16K-SG05LP3-EU-SM2'], '1 حبة', '2,650.00', '2,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '30 الواح', '130.00', '3,900.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '3.00', '270.00']
    ]},
    'i16t33': { num: 'ACTES-689', total: '12,705.00', url: 'https://files.catbox.moe/0884yj.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-16K-SG05LP3-EU-SM2'], '1 حبة', '2,650.00', '2,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '33 الواح', '130.00', '4,290.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '3.00', '270.00']
    ]},
    'i16t36': { num: 'ACTES-690', total: '13,095.00', url: 'https://files.catbox.moe/2tuv21.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['16 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-16K-SG05LP3-EU-SM2'], '1 حبة', '2,650.00', '2,650.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '36 الواح', '130.00', '4,680.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-63AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '50.00', '50.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '3.00', '270.00']
    ]},
    'i20t30': { num: 'ACTES-692', total: '12,290.00', url: 'https://files.catbox.moe/q08q3l.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['20 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-20K-SG05LP3EU-SM2'], '1 حبة', '2,600.00', '2,600.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '30 الواح', '130.00', '3,900.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-100AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '120.00', '120.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '2.50', '225.00']
    ]},
    'i20t33': { num: 'ACTES-693', total: '12,680.00', url: 'https://files.catbox.moe/3ywhhn.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['20 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-20K-SG05LP3EU-SM2'], '1 حبة', '2,600.00', '2,600.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '33 الواح', '130.00', '4,290.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '3 حبة', '1,800.00', '5,400.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-100AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '120.00', '120.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '2.50', '225.00']
    ]},
    'i20t39': { num: 'ACTES-694', total: '15,260.00', url: 'https://files.catbox.moe/80qgvp.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['20 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-20K-SG05LP3EU-SM2'], '1 حبة', '2,600.00', '2,600.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '39 الواح', '130.00', '5,070.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '4 حبة', '1,800.00', '7,200.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية ثري فاز', ['موديل: AC-MCB-4P-100AH', 'قاطع دخول عدد 1 | قاطع خروج عدد 1 (لكل انفرتر)'], '1 حبة', '120.00', '120.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '90 متر', '2.50', '225.00']
    ]},
    'i20t52': { num: 'ACTES-695', total: '17,025.00', url: 'https://files.catbox.moe/uc7uhl.pdf', items: [
      ['انفرتر دايا هايبرد DEYE', ['20 كيلو وات 48 فولت ثري فاز', 'الموديل: SUN-20K-SG05LP3EU-SM2'], '1 حبة', '2,600.00', '2,600.00'],
      ['ألواح طاقة شمسية سنتك N-Type', ['720 وات بوجهين فئة A', 'N-TYPE TOPCON كفاءة 23.2%'], '52 الواح', '130.00', '6,760.00'],
      ['بطارية ليثيوم بايلونتك PYLONTECH', ['16 كيلو وات 51.2 فولت', 'الموديل: Fidus-FB-L-16-PRO'], '4 حبة', '1,800.00', '7,200.00'],
      ['لوحة حماية تيار مستمر 3 مجموعات', ['صندوق تجميع | عدد المجموعات: 3', 'قاطع MCB 2P 32AH DC عدد 3 | فيوز مع الحافظة 1000V DC 32AH عدد 6'], '1 حبة', '45.00', '45.00'],
      ['لوحة حماية تيار مستمر 4 مجموعات', ['صندوق تجميع | عدد المجموعات: 4', 'قاطع MCB 2P 32AH DC عدد 4 | فيوز مع الحافظة 1000V DC 32AH عدد 8'], '1 حبة', '120.00', '120.00'],
      ['كابل نحاس مجلفن', ['1500 فولت مفرد 6 مم'], '120 متر', '2.50', '300.00']
    ]},
  };

  // ===== منظومات القدرات الكبيرة 50 / 80 / 125 كيلو — مولّدة آلياً من الجداول المعتمدة =====
  // كل صف: [القدرة، عدد الانفرترات، رقم الصف، عدد الألواح، القدرة ك.و.ب، خيارات البطاريات الستة، لوحة AC، خطوط DC]
  var BIG_ROWS = [
    [50,1,1,75,54.00,[4,5,6,7,8,9],"1 × 160A",6],
    [50,1,2,90,64.80,[6,7,8,9,10,11],"1 × 160A",6],
    [50,1,3,105,75.60,[8,9,10,11,12,13],"1 × 160A",8],
    [50,1,4,120,86.40,[11,12,13,14,15,16],"1 × 160A",8],
    [50,2,1,150,108.00,[8,10,12,14,16,18],"2 × 160A + Main 400A",10],
    [50,2,2,180,129.60,[12,14,16,18,20,22],"2 × 160A + Main 400A",12],
    [50,2,3,210,151.20,[16,18,20,22,24,26],"2 × 160A + Main 400A",14],
    [50,2,4,240,172.80,[22,24,26,28,30,32],"2 × 160A + Main 400A",16],
    [50,3,1,225,162.00,[12,15,18,21,24,27],"3 × 160A + Main 630A",16],
    [50,3,2,270,194.40,[18,21,24,27,30,33],"3 × 160A + Main 630A",18],
    [50,3,3,315,226.80,[24,27,30,33,36,39],"3 × 160A + Main 630A",22],
    [50,3,4,360,259.20,[33,36,39,42,45,48],"3 × 160A + Main 630A",24],
    [50,4,1,300,216.00,[16,20,24,28,32,36],"4 × 160A + Main 800A",20],
    [50,4,2,360,259.20,[24,28,32,36,40,44],"4 × 160A + Main 800A",24],
    [50,4,3,420,302.40,[32,36,40,44,48,52],"4 × 160A + Main 800A",28],
    [50,4,4,480,345.60,[44,48,52,56,60,64],"4 × 160A + Main 800A",32],
    [50,5,1,375,270.00,[20,25,30,35,40,45],"5 × 160A + Main 800A",26],
    [50,5,2,450,324.00,[30,35,40,45,50,55],"5 × 160A + Main 800A",30],
    [50,5,3,525,378.00,[40,45,50,55,60,65],"5 × 160A + Main 800A",36],
    [50,5,4,600,432.00,[55,60,65,70,75,80],"5 × 160A + Main 800A",40],
    [50,6,1,450,324.00,[24,30,36,42,48,54],"6 × 160A + Main 1000A",30],
    [50,6,2,540,388.80,[36,42,48,54,60,66],"6 × 160A + Main 1000A",36],
    [50,6,3,630,453.60,[48,54,60,66,72,78],"6 × 160A + Main 1000A",42],
    [50,6,4,720,518.40,[66,72,78,84,90,96],"6 × 160A + Main 1000A",48],
    [50,7,1,525,378.00,[28,35,42,49,56,63],"7 × 160A + Main 1250A",36],
    [50,7,2,630,453.60,[42,49,56,63,70,77],"7 × 160A + Main 1250A",42],
    [50,7,3,735,529.20,[56,63,70,77,84,91],"7 × 160A + Main 1250A",50],
    [50,7,4,840,604.80,[77,84,91,98,105,112],"7 × 160A + Main 1250A",56],
    [50,8,1,600,432.00,[32,40,48,56,64,72],"8 × 160A + Main 1600A",40],
    [50,8,2,720,518.40,[48,56,64,72,80,88],"8 × 160A + Main 1600A",48],
    [50,8,3,840,604.80,[64,72,80,88,96,104],"8 × 160A + Main 1600A",56],
    [50,8,4,960,691.20,[88,96,104,112,120,128],"8 × 160A + Main 1600A",64],
    [80,1,1,153,110.16,[12,14,16,18,20,22],"1 × 250A",10],
    [80,1,2,187,134.64,[14,16,18,20,22,24],"1 × 250A",12],
    [80,1,3,204,146.88,[18,20,22,24,26,28],"1 × 250A",12],
    [80,2,1,306,220.32,[24,28,32,36,40,44],"2 × 250A + Main 630A",18],
    [80,2,2,374,269.28,[28,32,36,40,44,48],"2 × 250A + Main 630A",22],
    [80,2,3,408,293.76,[36,40,44,48,52,56],"2 × 250A + Main 630A",24],
    [80,3,1,459,330.48,[36,42,48,54,60,66],"3 × 250A + Main 800A",28],
    [80,3,2,561,403.92,[42,48,54,60,66,72],"3 × 250A + Main 800A",34],
    [80,3,3,612,440.64,[54,60,66,72,78,84],"3 × 250A + Main 800A",36],
    [80,4,1,612,440.64,[48,56,64,72,80,88],"4 × 250A + Main 1000A",36],
    [80,4,2,748,538.56,[56,64,72,80,88,96],"4 × 250A + Main 1000A",44],
    [80,4,3,816,587.52,[72,80,88,96,104,112],"4 × 250A + Main 1000A",48],
    [80,5,1,765,550.80,[60,70,80,90,100,110],"5 × 250A + Main 1250A",46],
    [80,5,2,935,673.20,[70,80,90,100,110,120],"5 × 250A + Main 1250A",56],
    [80,5,3,1020,734.40,[90,100,110,120,130,140],"5 × 250A + Main 1250A",60],
    [80,6,1,918,660.96,[72,84,96,108,120,132],"6 × 250A + Main 1600A",54],
    [80,6,2,1122,807.84,[84,96,108,120,132,144],"6 × 250A + Main 1600A",66],
    [80,6,3,1224,881.28,[108,120,132,144,156,168],"6 × 250A + Main 1600A",72],
    [125,1,1,221,159.00,[12,14,16,18,20,22],"1 × 250A",14],
    [125,1,2,255,183.00,[14,16,18,20,22,24],"1 × 250A",16],
    [125,1,3,289,208.00,[16,18,20,22,24,26],"1 × 250A",18],
    [125,1,4,323,232.00,[18,20,22,24,26,28],"1 × 250A",20],
    [125,2,1,442,318.00,[24,28,32,36,40,44],"2 × 250A + Main 630A",26],
    [125,2,2,510,367.00,[28,32,36,40,44,48],"2 × 250A + Main 630A",30],
    [125,2,3,578,416.00,[32,36,40,44,48,52],"2 × 250A + Main 630A",34],
    [125,2,4,646,465.00,[36,40,44,48,52,56],"2 × 250A + Main 630A",38],
    [125,3,1,663,477.00,[36,42,48,54,60,66],"3 × 250A + Main 800A",40],
    [125,3,2,765,550.00,[42,48,54,60,66,72],"3 × 250A + Main 800A",46],
    [125,3,3,867,624.00,[48,54,60,66,72,78],"3 × 250A + Main 800A",52],
    [125,3,4,969,697.00,[54,60,66,72,78,84],"3 × 250A + Main 800A",58],
    [125,4,1,884,636.00,[48,56,64,72,80,88],"4 × 250A + Main 1000A",52],
    [125,4,2,1020,734.00,[56,64,72,80,88,96],"4 × 250A + Main 1000A",60],
    [125,4,3,1156,832.00,[64,72,80,88,96,104],"4 × 250A + Main 1000A",68],
    [125,4,4,1292,930.00,[72,80,88,96,104,112],"4 × 250A + Main 1000A",76],
    [125,5,1,1105,795.00,[60,70,80,90,100,110],"5 × 250A + Main 1250A",66],
    [125,5,2,1275,917.00,[70,80,90,100,110,120],"5 × 250A + Main 1250A",76],
    [125,5,3,1445,1040.00,[80,90,100,110,120,130],"5 × 250A + Main 1250A",86],
    [125,5,4,1615,1162.00,[90,100,110,120,130,140],"5 × 250A + Main 1250A",96],
    [125,6,1,1326,954.00,[72,84,96,108,120,132],"6 × 250A + Main 1600A",78],
    [125,6,2,1530,1101.00,[84,96,108,120,132,144],"6 × 250A + Main 1600A",90],
    [125,6,3,1734,1248.00,[96,108,120,132,144,156],"6 × 250A + Main 1600A",102],
    [125,6,4,1938,1395.00,[108,120,132,144,156,168],"6 × 250A + Main 1600A",114]
  ];

  var BIG_PRICE = {
    panel: 130, bat: 2000, batCtrl: 1500, batBox: 150,
    dc: { 2: 80, 4: 230, 6: 450, 8: 530, 10: 630 },
    acBox: 250, br160: 300, br250: 400,
    main: { '400A': 450, '630A': 650, '800A': 850, '1000A': 1050, '1250A': 1300, '1600A': 1600 },
    pvCable: 3.00, flexCable: 45, earthPit: 200, earth6: 2.00, earth16: 4.00,
    acc: 400, fireExt: 60, fireBall: 15, mount: 85, labor: 10
  };

  var BIG_INV = {
    50: { img: 'solis50', str: 15, price: 4200, name: 'انفرتر سوليس 50 كيلو 3 فاز جهد عالي',
          short: 'انفرتر سوليس هايبرد 50 كيلو 3 فاز',
          title: 'انفرتر سوليس هايبرد SOLIS',
          det: ["50 كيلو وات 3 فاز جهد عالي - هايبرد", "الموديل: S6-EH3P50K-H", "أقصى قدرة ألواح موصى بها 100 ك.و.ب | أقصى قدرة PV قابلة للاستخدام 96 ك.و.ب | أقصى جهد PV 1000 فولت DC | مدى MPPT 150-850 فولت", "عدد MPPT: 4 | تيار دخل PV: 4×40A | بطارية Li-ion: 150-800 فولت DC | أقصى شحن/تفريغ: 70A×2 | الكفاءة القصوى 97.8%"] },
    80: { img: 'deye80t', str: 17, price: 6200, name: 'انفرتر دايا 80 كيلو 3 فاز جهد عالي',
          short: 'انفرتر دايا هايبرد 80 كيلو 3 فاز',
          title: 'انفرتر دايا هايبرد DEYE',
          det: ['80 كيلو وات 3 فاز جهد عالي - هايبرد', 'الموديل: SUN-80K-SG01HP3-EU', 'أقصى قدرة ألواح 104 ك.و.ب | جهد الدخول 200-1000 فولت DC', 'عدد MPPT: 4 | كفاءة 98.4% | جهد البطاريات 512 فولت'] },
    125: { img: 'solis125', str: 17, price: 6200, name: 'انفرتر سوليس 125 كيلو 3 فاز جهد عالي',
          short: 'انفرتر سوليس هايبرد 125 كيلو 3 فاز',
          title: 'انفرتر سوليس هايبرد SOLIS',
          det: ['125 كيلو وات 3 فاز جهد عالي - هايبرد', 'الموديل: S6-EH3P125K-H', 'أقصى قدرة ألواح 250 ك.و.ب | أقصى جهد PV 1000 فولت DC | مدى MPPT 150-950 فولت', 'عدد MPPT: 10 | تيار دخل PV: 10×42A | بطارية Li-ion: 300-950 فولت DC | أقصى شحن/تفريغ: 100A×2 | الكفاءة القصوى 97.5%'] }
  };

  // توزيع خطوط الـ DC على أقل عدد صناديق (أكبر صندوق 10 خطوط، والمقاسات 6 / 8 / 10)
  function bigDcBoxes(lines) {
    lines = Math.max(1, Number(lines) || 1);
    var nBox = Math.ceil(lines / 10);
    var base = Math.floor(lines / nBox);
    var rem = lines % nBox;
    var groups = {};
    for (var i = 0; i < nBox; i++) {
      var need = base + (i < rem ? 1 : 0);
      var size = need <= 2 ? 2 : (need <= 4 ? 4 : (need <= 6 ? 6 : (need <= 8 ? 8 : 10)));
      groups[size] = (groups[size] || 0) + 1;
    }
    var out = [];
    [10, 8, 6, 4, 2].forEach(function (s) { if (groups[s]) { out.push({ size: s, count: groups[s] }); } });
    return out;
  }

  // تحليل عمود AC-Combiner من الجدول: "3 × 160A + Main 630A"
  function bigAcParts(ac) {
    var mBr = String(ac).match(/(\d+)\s*×\s*(\d+)A/);
    var mMn = String(ac).match(/Main\s*(\d+)A/);
    var nBr = mBr ? Number(mBr[1]) : 1;
    var brA = mBr ? Number(mBr[2]) : 160;
    var mainA = mMn ? (mMn[1] + 'A') : '';
    var price = BIG_PRICE.acBox + nBr * (brA >= 250 ? BIG_PRICE.br250 : BIG_PRICE.br160) +
      (mainA ? (BIG_PRICE.main[mainA] || 0) : 0);
    var det = ['صندوق دمج وحماية تيار متردد 4 فاز 400 فولت',
      nBr + ' قواطع فرعية MCCB ' + brA + 'A 4P'];
    det.push(mainA ? ('قاطع رئيسي MCCB ' + mainA + ' 4P') : 'بدون قاطع رئيسي (انفرتر واحد)');
    det.push('بيت بار نحاس + مؤشرات جهد');
    return { det: det, price: price, label: String(ac) };
  }

  function bigMoney(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function bigBuildItems(kw, nInv, panels, kwp, nBat, ac, dcLines) {
    var inv = BIG_INV[kw];
    var strP = inv.str;
    var nStr = Math.ceil(panels / strP);
    var items = [];
    function add(title, det, qty, unit, price) {
      items.push([title, det, bigMoney(qty).replace('.00', '') + ' ' + unit, bigMoney(price), bigMoney(qty * price)]);
    }
    add('ألواح طاقة شمسية سنتك N-Type TOPCon 720 وات ثنائية الوجه', ['720 وات | زجاج-زجاج ثنائي الوجه', 'الموديل: STP720S-D66/Nsh+', 'N-TYPE TOPCON كفاءة 23.2% | Vmp 38.00V | Imp 17.81A | Voc 48.45V | Isc 18.83A | معامل ثنائية الوجه 80 ± 5%', 'عدد المجموعات: ' + nStr + ' × ' + strP + ' لوح/مجموعة | إجمالي ' + kwp.toFixed(2) + ' ك.و.ب'], panels, 'الواح', BIG_PRICE.panel);
    add(inv.title, inv.det, nInv, 'حبة', inv.price);
    add('بطارية ليثيوم هيثيوم HITHIUM هاي فولتج', ['16 كيلو وات ساعة 51.2 فولت 314 أمبير', 'الموديل: LEGND112S-EPM-16HV', 'خلايا LFP دورة حياة 8000 | عمق تفريغ 90%', 'السعة الكلية: ' + (nBat * 16) + ' كيلو وات ساعة'], nBat, 'حبة', BIG_PRICE.bat);
    var nCtrl = Math.ceil(nBat / 15);
    add('كنترول ربط بطاريات هيثيوم هاي فولتج', ['الموديل: HEROEE-EPD-16HV', 'LEGEND 112S-112SPDU | قابل لربط 15 بطارية لكل كنترول', 'يشمل قاطع DC رئيسي وحماية وشاشة مراقبة'], nCtrl, 'حبة', BIG_PRICE.batCtrl);
    add('صندوق حماية بطاريات', ['قاطع MCCB-2P-250A تيار مستمر', 'كابلات ربط وبيت بار نحاس + حماية من القطبية العكسية'], nInv, 'حبة', BIG_PRICE.batBox);
    var boxes = bigDcBoxes(dcLines);
    boxes.forEach(function (b) {
      add('صندوق حماية وتجميع تيار مستمر DC', [b.size + ' خطوط دخول | ' + b.size + ' خطوط خروج', 'فيوزات 1000V DC مع حواملها لكل خط (موجب وسالب)', 'قاطع DC رئيسي 1000V', 'صندوق IP65 مقاوم للماء والأشعة'], b.count, 'حبة', BIG_PRICE.dc[b.size]);
    });
    var acp = bigAcParts(ac);
    add('صندوق دمج تيار متردد AC', acp.det, 1, 'حبة', acp.price);
    add('كابل نحاس مجلفن للألواح', ['1500 فولت مفرد 10 مم - الكان كابل تركي', 'مقاوم للأشعة فوق البنفسجية'], panels * 4, 'متر', BIG_PRICE.pvCable);
    add('كابل نحاس فلكس شعيرات', ['مقاس 4×50 ملي - CU/PVC/PVC/FLEX 600/1000V', 'ربط الانفرترات بلوحة الدمج'], nInv * 30, 'متر', BIG_PRICE.flexCable);
    add('حفرة تأريض مع جميع مكوناتها', ['سيخ نحاس 16 مم + ملح وفحم', 'حفرة 1.2×1 متر مع غرفة تفتيش'], nInv + 1, 'حبة', BIG_PRICE.earthPit);
    add('كابل نحاس أرت', ['مقاس 1×6 مم - CU/PVC 450/750V', 'تأريض قواعد الألواح'], panels * 2, 'متر', BIG_PRICE.earth6);
    add('كابل نحاس أرت', ['مقاس 1×16 مم - CU/PVC 450/750V', 'تأريض الانفرترات واللوحات'], nInv * 30, 'متر', BIG_PRICE.earth16);
    add('اكسسوارات ومستلزمات التركيب', ['كنشات MC4 - مواسير وقنوات - براغي وشدادات', 'لواصق ترقيم ولوحات تحذير'], nInv, 'حبة', BIG_PRICE.acc);
    add('طفاية حريق ثاني اكسيد الكربون', ['سعة 6 كيلو مع حاملها'], nInv, 'حبة', BIG_PRICE.fireExt);
    add('كرة حريق', ['1.5 كيلو - تعمل تلقائياً عند الحريق'], nInv * 3, 'حبة', BIG_PRICE.fireBall);
    add('اجور تركيب منظومة شمسية', ['تركيب القواعد والألواح والانفرترات واللوحات', 'التمديدات والبرمجة والتشغيل والاختبار'], panels, 'لوح', BIG_PRICE.labor);
    var total = 0;
    items.forEach(function (it) { total += (parseFloat(String(it[3]).replace(/,/g, '')) || 0) * (parseFloat(String(it[2]).replace(/,/g, '')) || 0); });
    return { items: items, total: bigMoney(total) };
  }

  var BIG_SPECS = {};
  (function buildBigCatalog() {
    for (var i = 0; i < BIG_ROWS.length; i++) {
      var r = BIG_ROWS[i];
      var kw = r[0], nInv = r[1], rowIdx = r[2], panels = r[3], kwp = r[4], bats = r[5], ac = r[6], dc = r[7];
      var inv = BIG_INV[kw];
      for (var b = 0; b < bats.length; b++) {
        var nBat = bats[b];
        var code = 'i' + kw + 'n' + nInv + 'r' + rowIdx + 'b' + (b + 1);
        var daily = Math.round(kwp * 5.5 * 100) / 100;
        var night = Math.round(nBat * 16 * 0.9 * 100) / 100;
        var day = Math.round(Math.max(0, daily - night) * 100) / 100;
        INV_TABLE.push({
          kw: kw, inv: inv.name, code: code, panels: panels, pv: kwp, daily: daily,
          bat: nBat * 16, night: night, day: day, phase3: true, string: inv.str, nInv: nInv
        });
        var built = bigBuildItems(kw, nInv, panels, kwp, nBat, ac, dc);
        COM_QUOTES[code] = {
          num: 'ACTES-' + kw + '-' + nInv + '-' + rowIdx + '-' + (b + 1),
          total: built.total, url: '', items: built.items
        };
        COM_IMG[code] = inv.img;
        BIG_SPECS[code] = {
          volt: 'جهد عالي',
          invShort: inv.short + (nInv > 1 ? (' × ' + nInv) : ''),
          pvShort: panels + '× (720W) - ' + inv.str + ' لوح/مجموعة',
          batShort: '16 كيلو × ' + nBat + ' (Hithium HV)'
        };
      }
    }
  })();


  function comItemLine(n, title, details, qty, price, total, last) {
    var t = '' + title + '';
    if (details.length) { t += ' _' + details.join(' - ') + '_'; }
    t += '\n';
    t += 'الكمية: ' + qty + ' | السعر: ' + price + ' $ | الإجمالي: ' + total + ' $\n';
    t += last ? '' : '_________\n';
    return t;
  }

  function actesFooter() {
    var t = '';
    t += ' المبيعات: 770229994\n';
    t += ' الموقع: www.actesgroup.com\n';
    t += ' أكتس لأنظمة الطاقة وحلولها\n';
    return t;
  }

  function comHeader(title, cname, qnum) {
    var dp = now.substring(0, 10).split('-');
    var dateStr = dp[2] + '/' + dp[1] + '/' + dp[0];
    var out = '';
    out += SEP + '\n';
    out += AC + '\n';
    out += SEP + '\n';
    out += ' SUNTECH • Li Power\n';
    out += ' PYLONTECH • HTHIUM\n\n';
    out += ' *' + title + '* \n\n';
    out += SEP + '\n';
    if (qnum) { out += ' رقم العرض: ' + qnum + '\n'; }
    out += ' التاريخ: ' + dateStr + '\n';
    if (cname) { out += ' العميل: ' + cname + ' المحترم\n'; }
    out += SEP + '\n\n';
    return out;
  }

  function comQuoteItems(code) {
    var q = COM_QUOTES[code];
    var out = [];
    if (!q || !q.items) { return out; }
    var hv = false;
    for (var i = 0; i < q.items.length; i++) {
      var it = q.items[i];
      var desc = String(it[0] || '');
      var det = it[1] || [];
      if (/جهد عالي/.test(desc + ' ' + det.join(' '))) { hv = true; }
      var mm = String(it[2] || '').match(/^([\d.,]+)\s*(.*)$/);
      var qty = mm ? (parseFloat(mm[1].replace(/,/g, '')) || 1) : 1;
      var unit = (mm && mm[2]) ? mm[2] : 'حبه';
      out.push({ key: '', name: desc, details: det, unit: unit, qty: qty, price: parseFloat(String(it[3]).replace(/,/g, '')) || 0, total: parseFloat(String(it[4]).replace(/,/g, '')) || 0 });
    }
    return actesNormalize(out, { hv: hv });
  }

  function comQuoteText(code, cname, sysLabel) {
    var q = COM_QUOTES[code];
    if (!q) { return m('contact_ok'); }
    return plainQuoteText(comQuoteItems(code), cname);
  }

  // ===== منطق تعدد الانفرترات حسب القدرة المختارة =====
  // خريطة القدرة -> عرض السعر المرجعي (يُعتمد عليه لاستخراج بند الانفرتر وسعره)
  var COM_INV_REF = { 8: 'p8', 12: 'i12p9', 16: 'i16p18', 20: 'i20t30', 50: 'i50n1r1b1', 80: 'i80n1r1b1', 125: 'i125n1r1b1' };
  // ============================================================
  // مصدر واحد للحقيقة للمسار التجاري (comConfig)
  // كل المخارج (رسالة المنظومة + عرض السعر + الدراسة + المخطط) تقرأ من هنا فقط
  // القاعدة: المنظومة الموصى بها تحدد كل الأصناف، والانفرتر فقط يتغير بحسب اختيار العميل
  // عدد الانفرترات = ceil(القدرة الموصى بها / القدرة المختارة)
  // ولا يُختار أي مكوّن من خارج جداول وعروض المسار التجاري
  // ============================================================
  function comCatalogRows() {
    return INV_TABLE.filter(function (rw) { return !!COM_QUOTES[rw.code]; });
  }
  function comPhaseFilter(rw) {
    if (!phase_type) { return true; }
    return phase_type === 'three' ? !!rw.phase3 : !rw.phase3;
  }
  // اسم الانفرتر كما في جدول المسار التجاري
  function comInvNameFor(kw) {
    var rws = INV_TABLE.filter(function (rw) { return rw.kw === kw && comPhaseFilter(rw); });
    if (!rws.length) { rws = INV_TABLE.filter(function (rw) { return rw.kw === kw; }); }
    return rws.length ? rws[0].inv : ('انفرتر ' + kw + ' كيلو');
  }
  // موديل الانفرتر الحقيقي من بند عرض السعر التجاري
  function comInvModelFor(kw) {
    var it = comInvItemFor(kw);
    var det = (it && it.details) ? it.details.join(' | ') : '';
    var mm = det.match(/الموديل\s*:\s*([^|]+)/);
    return mm ? mm[1].trim() : '';
  }
  // مواصفات المنظومة كما في عرض السعر التجاري (ألواح/بطاريات فعلية)
  function comPkgSpec(code) {
    var q = COM_QUOTES[code];
    if (!q || !q.items) { return null; }
    var spec = { panels: 0, nBat: 0, batKey: 'hth16' };
    for (var i = 0; i < q.items.length; i++) {
      var it = q.items[i];
      var title = String(it[0] || '');
      var det = (it[1] || []).join(' | ');
      var mq = String(it[2] || '').match(/^([\d.,]+)/);
      var qty = mq ? (parseFloat(mq[1].replace(/,/g, '')) || 0) : 0;
      if (/ألواح طاقة/.test(title)) { spec.panels = qty || spec.panels; }
      else if (/^بطارية/.test(title)) {
        spec.nBat = qty || spec.nBat;
        if (/LEGND112S|LEGEND/.test(det)) { spec.batKey = 'hthv16'; }
        else if (/Fidus/i.test(det)) { spec.batKey = 'fidus16'; }
        else if (/UF5000/i.test(det)) { spec.batKey = 'uf5000'; }
        else { spec.batKey = 'hth16'; }
      }
    }
    return spec;
  }
  // مفتاح الانفرتر في قوائم الرسم/الدراسة من انفرترات المسار التجاري فقط
  function comSldInvKey(kw, is3) {
    if (kw >= 125) { return 'solis125'; }
    if (kw >= 80) { return 'deye80'; }
    if (kw >= 50) { return 'deye50'; }
    if (kw >= 20) { return 'deye20'; }
    if (kw >= 16) { return is3 ? 'deye16t' : 'deye16'; }
    if (kw >= 12) { return is3 ? 'deye12' : 'deye12s'; }
    return 'deye8';
  }
  // القرار الموحد
  function comConfig() {
    var need = (parseFloat(peak_load) || 0) / 30; // كيلووات/يوم
    if (!need) { return null; }
    var kwSel = parseFloat(pump_capacity) || 0;
    var rows = comCatalogRows().filter(comPhaseFilter);
    if (kwSel) {
      var rowsSel = rows.filter(function (rw) { return rw.kw === kwSel; });
      if (rowsSel.length) { rows = rowsSel; }
    }
    rows = rows.sort(function (a, b) {
      if (a.kw !== b.kw) { return a.kw - b.kw; }
      return a.daily - b.daily;
    });
    // نفس معادلة السكني: اختيار المنظومة ذات الإنتاج اليومي الأقرب للاحتياج
    // Daily Need = الاستهلاك الشهري ÷ 30
    // ثم اختيار أقل فرق مطلق بين إنتاج المنظومة والاحتياج اليومي
    // القاعدة: الاستهلاك الشهري ÷ 30 = الاحتياج اليومي، ثم أصغر منظومة إنتاجها >= الاحتياج
    var byDaily = rows.slice().sort(function (a, b) {
      if (a.daily !== b.daily) { return a.daily - b.daily; }
      return a.kw - b.kw;
    });
    var rec = null;
    for (var i = 0; i < byDaily.length; i++) {
      if (byDaily[i].daily >= need - 0.0001) { rec = byDaily[i]; break; }
    }
    if (!rec) { return null; } // الاحتياج أعلى من أكبر منظومة -> تحويل للموظف المختص
    var chosenKw = rec.kw;
    var nInv = rec.nInv ? rec.nInv : (chosenKw >= rec.kw ? 1 : Math.max(1, Math.ceil(rec.kw / chosenKw)));
    var spec = comPkgSpec(rec.code) || { panels: rec.panels, nBat: Math.max(1, Math.round(rec.bat / 16)), batKey: 'hth16' };
    var dayPct = Math.round(rec.day / rec.daily * 100);
    var is3 = (phase_type === 'three') || !!rec.phase3;
    return {
      code: rec.code, recKw: rec.kw, chosenKw: chosenKw, nInv: nInv,
      recInvName: rec.inv, invName: comInvNameFor(chosenKw), invModel: comInvModelFor(chosenKw),
      panels: spec.panels || rec.panels, pv: rec.pv, bat: rec.bat,
      batKey: spec.batKey, nBat: spec.nBat || Math.max(1, Math.round(rec.bat / 16)),
      daily: rec.daily, dayGen: rec.day, nightGen: rec.night,
      dayPct: dayPct, nightPct: 100 - dayPct, needDaily: Math.round(need * 10) / 10,
      phase3: is3, big: !!rec.nInv, quoteNum: (COM_QUOTES[rec.code] || {}).num || '',
      sldInv: comSldInvKey(chosenKw, is3)
    };
  }
  function comSysLabel(cfg) {
    return cfg.invName + (cfg.nInv > 1 ? (' × ' + cfg.nInv) : '') +
      ' | ألواح: ' + cfg.panels + ' (' + cfg.pv + ' ك.و) | بطاريات: ' + cfg.bat + ' كيلو';
  }
  function comInvImg(cfg) {
    var rws = INV_TABLE.filter(function (rw) { return rw.kw === cfg.chosenKw && (cfg.phase3 ? !!rw.phase3 : !rw.phase3); });
    if (!rws.length) { rws = INV_TABLE.filter(function (rw) { return rw.kw === cfg.chosenKw; }); }
    return rws.length ? (COM_IMG[rws[0].code] || null) : null;
  }
  // القدرة الموصى بها = أصغر قدرة يغطي إنتاجها اليومي احتياج العميل
  function comRecommendedKw() {
    var _cfgR = comConfig();
    return _cfgR ? _cfgR.recKw : 0;
  }
  // استخراج بند الانفرتر [عنوان، تفاصيل، سعر الوحدة] من عرض سعر مرجعي لقدرة معيّنة
  function comInvItemFor(kw) {
    var code = COM_INV_REF[kw];
    var q = code ? COM_QUOTES[code] : null;
    if (q && q.items) {
      for (var i = 0; i < q.items.length; i++) {
        if (/انفرتر/.test(String(q.items[i][0]))) {
          var it = q.items[i];
          return { title: it[0], details: it[1] || [], price: parseFloat(String(it[3]).replace(/,/g, '')) || 0 };
        }
      }
    }
    return { title: 'انفرتر ' + kw + ' كيلو', details: [kw + ' كيلو وات 3 فاز'], price: 0 };
  }
  // بناء بنود عرض السعر عند اختيار قدرة أصغر من الموصى بها
  // القاعدة: أساس البنود = منظومة القدرة الموصى بها، مع:
  //  - استبدال بند الانفرتر بالقدرة المختارة (الكمية = عدد الانفرترات = ceil(recKw/chosenKw))
  //  - مضاعفة كمية لوحة AC (الدخول/الخروج) لتساوي عدد الانفرترات
  //  - باقي البنود تبقى كما هي في منظومة القدرة الموصى بها
  function comBuildQuoteItems(cfg) {
    if (!cfg) { return null; }
    var refQ = COM_QUOTES[cfg.code];
    if (!refQ || !refQ.items) { return null; }
    var nInv = cfg.nInv;
    var mult = cfg.big ? 1 : nInv; // نماذج القدرات الكبيرة كمياتها مضبوطة مسبقاً من الجداول
    var invItem = comInvItemFor(cfg.chosenKw);
    var out = [];
    for (var i = 0; i < refQ.items.length; i++) {
      var it = refQ.items[i];
      var title = String(it[0]);
      var mm = String(it[2] || '').match(/^([\d.,]+)\s*(.*)$/);
      var baseQty = mm ? (parseFloat(mm[1].replace(/,/g, '')) || 1) : 1;
      var unitLbl = (mm && mm[2]) ? mm[2] : 'حبة';
      var unitPrice = parseFloat(String(it[3]).replace(/,/g, '')) || 0;
      if (/انفرتر/.test(title)) {
        // بند الانفرتر فقط هو الذي يتغير: قدرة العميل × عدد الانفرترات
        out.push({ key: '', name: invItem.title, details: invItem.details, unit: 'حبة', qty: nInv, price: invItem.price, total: nInv * invItem.price });
      } else if (/لوح(ة|ات) تجميع|لوحة حماية (ثري|سنجل) فاز|صندوق دمج تيار متردد|صندوق توزيع تيار متردد/.test(title)) {
        // لوحة AC لكل انفرتر
        out.push({ key: '', name: title, details: it[1] || [], unit: unitLbl, qty: baseQty * mult, price: unitPrice, total: baseQty * mult * unitPrice });
      } else {
        // بقية الأصناف كما هي في المنظومة الموصى بها
        out.push({ key: '', name: title, details: it[1] || [], unit: unitLbl, qty: baseQty, price: unitPrice, total: baseQty * unitPrice });
      }
    }
    out = actesNormalize(out, { hv: /جهد عالي/.test(JSON.stringify(out)) });
    return { items: out, nInv: nInv, recKw: cfg.recKw, chosenKw: cfg.chosenKw };
  }

  // نص عرض السعر لبنود مبنية ديناميكياً (نفس تنسيق comQuoteText)
  function comBuildQuoteText(built, cname) {
    return plainQuoteText(built.items, cname);
  }
  // يُصدر عرض سعر تجاري متعدد الانفرترات إن انطبقت الشروط، ويعيد true عند النجاح
  function comIssueMultiQuote(cname) {
    var cfg = comConfig();
    if (!cfg) { return false; }
    // نفس منظومة عرض السعر الجاهز -> يُستخدم المسار الجاهز (بنفس المنظومة تماماً)
    if (cfg.nInv <= 1 && cfg.chosenKw === cfg.recKw) { return false; }
    var invItem = comInvItemFor(cfg.chosenKw);
    if (!invItem || !invItem.price) {
      // لا سعر معتمد للانفرتر المختار -> لا يُصدر عرض بسعر صفر
      notify_employee = true;
      notification_text = AC + ' — انفرتر مختار بدون سعر معتمد\n' + SEP + '\nالعميل: ' + (cname || '-') +
        '\nالمنظومة الموصى بها: ' + cfg.recKw + ' كيلو (' + cfg.code + ')' +
        '\nالانفرتر المختار: ' + cfg.chosenKw + ' كيلو × ' + cfg.nInv +
        '\nالهاتف: ' + phone;
      response = W(' نعتذر منك\n' + SEP + '\nسعر الانفرتر المختار غير معتمد حالياً._\n' + SEP + '\nسنوصلك بالموظف المختص لإصدار عرض السعر._\n ' + EMP_PHONE + '\n\nأرسل 0 للعودة إلى البداية._');
      return 'escalate';
    }
    var built = comBuildQuoteItems(cfg);
    if (!built) { return false; }
    response = comBuildQuoteText(built, cname || '...........');
    quote_items = stripBaseItems(built.items);
    item_quote = true;
    send_quote_file = true;
    quote_number = 'ACTES-C' + String(Date.now()).slice(-6);
    quote_file_url = '';
    quote_file_name = 'عرض سعر ' + quote_number + '.pdf';
    quote_caption = quoteAfterPdf(quote_items);
    return 'ok';
  }

  var COM_METHOD_NAMES = {
    '1': 'قيمة فاتورة الكهرباء (ريال/شهر)',
    '2': 'استهلاك كهرباء (كيلووات/شهر)',
    '3': 'استهلاك ديزل (لتر/شهر)'
  };
  function comMethodAsk() {
    return W('المسار التجاري\n' + SEP + '\nما متوسط استهلاكك للطاقة؟');
  }
  function comValueAsk(method) {
    var hint = method === '1' ? 'اكتب قيمة الفاتورة بالأرقام فقط _\nمثال: 50000_' : (method === '2' ? 'اكتب الاستهلاك بالكيلووات بالأرقام فقط _\nمثال: 900_' : 'اكتب استهلاك الديزل باللتر بالأرقام فقط _\nمثال: 250_');
    return W(' المسار التجاري\n' + SEP + '\n *' + COM_METHOD_NAMES[method] + '\n' + SEP + '\n' + hint);
  }
  // قدرات الانفرترات الأقرب لاحتياج العميل (خياران فقط)
  var COM_INV_SMALL = [8, 12, 16, 20];
  var COM_INV_BIG = [30, 50, 80, 125];
  // قدرة معتمدة = لها صفوف بعرض سعر فعلي + بند انفرتر بسعر معتمد
  function comQuoteReady(code) {
    var q = code ? COM_QUOTES[code] : null;
    if (!q) { return false; }
    return !!(q.url || (q.items && q.items.length));
  }
  function comInvHasOffer(kw) {
    var rows = INV_TABLE.filter(function (rw) { return rw.kw === kw && comQuoteReady(rw.code); });
    if (!rows.length) { return false; }
    var it = comInvItemFor(kw);
    return !!(it && it.price > 0);
  }
  function comInvOptions() {
    var need = (parseFloat(peak_load) || 0) / 30; // كيلووات/يوم
    var kws = [];
    INV_TABLE.forEach(function (rw) {
      if (!comQuoteReady(rw.code)) { return; }     // لا عرض سعر جاهز لهذا الصنف
      if (!comPhaseFilter(rw)) { return; }         // فلترة سنجل / ثري فاز
      if (kws.indexOf(rw.kw) < 0) { kws.push(rw.kw); }
    });
    kws = kws.filter(function (k) { return comInvHasOffer(k); });
    function maxDaily(kw) { var mx = 0; INV_TABLE.forEach(function (rw) { if (rw.kw === kw && comQuoteReady(rw.code) && rw.daily > mx) { mx = rw.daily; } }); return mx; }
    function avail(list) { return list.filter(function (k) { return kws.indexOf(k) >= 0; }); }
    var small = avail(COM_INV_SMALL);
    var big = avail(COM_INV_BIG);
    var smallMax = 0;
    small.forEach(function (k) { var v = maxDaily(k); if (v > smallMax) { smallMax = v; } });
    var use = (need <= smallMax && small.length) ? small : big;
    if (!use.length) { use = small.length ? small : []; }
    use = use.filter(function (k) { return comInvHasOffer(k); });
    // تُعرض فقط القدرات التي يغطي أقصى إنتاجها اليومي احتياج العميل (مساوٍ أو أكبر)
    var covering = use.filter(function (k) { return maxDaily(k) >= need - 0.0001; });
    use = covering;
    return use.sort(function (a, b) { return a - b; }).map(function (kw) { return { kw: kw, maxDaily: maxDaily(kw) }; });
  }
  // لا توجد قدرة لها عرض سعر معتمد -> تحويل للموظف المختص
  function comNoInvOfferEscalate() {
    notify_employee = true;
    notification_text = AC + ' — لا توجد قدرة انفرتر لها عرض سعر معتمد\n' + SEP + '\nالاستهلاك الشهري: ' + (monthly_consumption || '-') +
      '\nالاستهلاك المقدر: ' + (peak_load || '-') + ' كيلووات/شهر\nالهاتف: ' + phone;
    step = 'done';
    return W(' نعتذر منك\n' + SEP + '\nلا يوجد حالياً عرض سعر معتمد يناسب احتياجك._\n' + SEP + '\nسنوصلك بالموظف المختص لإعداد عرض خاص._\n ' + EMP_PHONE + '\n\nأرسل 0 للعودة إلى البداية._');
  }
  function comInvAsk() {
    var need = Math.round((parseFloat(peak_load) || 0) / 30);
    return W(' المسار التجاري\n' + SEP + '\n اختر قدرة الانفرتر\nاستهلاكك اليومي التقريبي: ' + need + ' كيلووات/يوم._\nهذه أقرب قدرات الانفرترات لاحتياجك اختر من الأزرار بالأسفل:_');
  }

  // يعتمد قدرة الانفرتر تلقائياً عندما لا يوجد إلا خيار واحد.
  function comSelectInvKw(_kw) {
    pump_capacity = String(_kw);
    if (_kw >= 20) { phase_type = 'three'; comApplyResult(); }
    else if (_kw === 8) { phase_type = 'single'; comApplyResult(); }
    else { step = 'com_phase_ask'; response = comPhaseAsk(); }
  }
  function comLookup(monthlyKwh) {
    var kwSel = parseFloat(pump_capacity) || 0;
    var daily = monthlyKwh / 30;
    var rows = INV_TABLE.slice().filter(function(rw0) { if (kwSel && rw0.kw !== kwSel) { return false; } return phase_type ? (phase_type === 'three' ? !!rw0.phase3 : !rw0.phase3) : true; }).sort(function(a, b) {
      if (a.kw !== b.kw) { return a.kw - b.kw; }
      if (a.phase3 === b.phase3) { return a.daily - b.daily; }
      return a.phase3 ? 1 : -1;
    });
    // القاعدة: أصغر منظومة إنتاجها اليومي مساوٍ أو أكبر من الاحتياج اليومي
    var rowsByDaily = rows.slice().sort(function (a, b) {
      if (a.daily !== b.daily) { return a.daily - b.daily; }
      return a.kw - b.kw;
    });
    var nearest = null;
    for (var i = 0; i < rowsByDaily.length; i++) {
      if (rowsByDaily[i].daily >= daily - 0.0001) { nearest = rowsByDaily[i]; break; }
    }
    if (nearest) {
      var rw = nearest;
      var dayPct = Math.round(rw.day / rw.daily * 100);
      return {
        inv: rw.inv, code: rw.code, kw: rw.kw, panels: rw.panels, pv: rw.pv, bat: rw.bat,
        total: rw.daily, dayGen: rw.day, nightGen: rw.night,
        dayPct: dayPct, nightPct: 100 - dayPct,
        daily: Math.round(daily * 10) / 10
      };
    }
    return null;
  }
  function comResult(r, kwh) {
    var methodKey = activity_type.replace('com_', '');
    var t = '';
    t += '_' + AC.replace('','').replace('','') + '_\n\n';
    t += SEP + '\n\n';
    t += 'طريقة الإدخال: *' + (COM_METHOD_NAMES[methodKey] || '') + '\n\n';
    t += 'القيمة المدخلة: ' + monthly_consumption + '\n\n';
    t += 'الاستهلاك الشهري:' + Math.round(kwh) + ' كيلووات\n\n';
    t += 'الاستهلاك اليومي:*' + r.daily + ' كيلووات/يوم\n\n';
    t += 'نسبة النهار/الليل:\n\n';
    t += '' + r.dayPct + '% نهار\n\n';
    t += '' + r.nightPct + '% ليل\n\n';
    t += 'المنظومة المقترحة:\n\n';
    t += '(Deye)' + r.inv + '\n\n';
    t += 'ألواح: ' + r.panels + ' (' + PANEL_W + 'W -Suntech)\n\n';
    t += '(Pylontech)بطاريات: ' + r.bat + 'كيلو وات \n\n';
    t += SEP + '\n\n';
    t += ' المبيعات:770229994*\n\n';
    t += ' الموقع: www.actesgroup.com\n\n';
    t += '_' + AC.replace('','').replace('','') + '_\n\n';
    t += comVisitAsk();
    return t;
  }
  function comResultCard(cfg, kwh) {
    var built = comBuildQuoteItems(cfg);
    var items = built && built.items ? built.items : comQuoteItems(cfg.code);
    return quoteProductsSummary(items) + '\n\nهل ترغب بعرض سعر رسمي؟ اختر من الأزرار التالية _';
  }

  function comNoData(kwh) {
    return W(' نعتذر منك\n' + SEP + '\nاحتياجك يتجاوز المنظومات الجاهزة لدينا._\n' + SEP + '\nسنوصلك بالموظف المختص لتصميم منظومة خاصة بحجم مشروعك._\n ' + EMP_PHONE + '\n\nأرسل 0 للعودة إلى البداية._');
  }
  function notifCom(cname, method, raw, kwh, ratioText, sysLabel, outRange) {
    var tsn = now.replace('T', ' ').substring(0, 16) + ' UTC';
    var head = outRange ? (AC + ' — طلب تجاري (بيانات غير متوفرة)') : (AC + ' — طلب عرض سعر تجاري');
    var t = head + '\n' + SEP + '\nالاسم: ' + cname + '\nطريقة الإدخال: ' + (COM_METHOD_NAMES[method] || '') + '\nالقيمة المدخلة: ' + raw + '\nالاستهلاك الشهري: ' + Math.round(kwh) + ' كيلووات\nالاستهلاك اليومي: ' + (Math.round(kwh/30*10)/10) + ' كيلووات/يوم';
    if (!outRange) {
      if (ratioText) { t += '\nنسبة النهار/الليل: ' + ratioText; }
      t += '\nالمنظومة المقترحة: ' + sysLabel;
    }
    t += '\n' + SEP + '\nالهاتف: ' + phone + '\nالوقت: ' + tsn;
    return t;
  }


  function comVisitAsk() {
    return '\nاختر من الأزرار التالية _' ;
  }

  function comApplyResult() {
    var cm2 = activity_type.replace('com_', '');
    var ckwh2 = parseFloat(peak_load);
    var cfg = comConfig();
    if (!cfg) {
      step = 'done'; notify_employee = true;
      notification_text = notifCom('-', cm2, monthly_consumption, ckwh2, '', '', true);
      response = comNoData(ckwh2);
      return;
    }
    load_type = cfg.code; // كود المنظومة الموصى بها = المصدر الموحد للدراسة والمخطط
    night_hours = cfg.dayPct + '% نهار / ' + cfg.nightPct + '% ليل';
    system_type = comSysLabel(cfg);
    inv_pick = comInvImg(cfg);
    inv_pick_line = cfg.invName + (cfg.nInv > 1 ? (' × ' + cfg.nInv) : '');
    step = 'com_visit_ask';
    response = comResultCard(cfg, ckwh2);
  }

  function comPhaseAsk() {
    return W('ما نوع توصيل الكهرباء لديك؟\n_Power Supply Type_\n\nملاحظة: بعد الاختيار سيتم عرض السعر مباشرة');
  }
  function comPhase3Map(code) {
    var map = {
      'p8':'i12t9','p9':'i12t9','p14':'i12t18','p16':'i12t21','p18':'i12t27',
      'i12p9':'i12t9','i12p18':'i12t18','i12p21':'i12t21','i12p27':'i12t27',
      'i16p18':'i16t26','i16p21':'i16t30','i16p24':'i16t33','i16p36':'i16t36'
    };
    return map[code] || code;
  }
  function comQuoteAsk() {
    var t = '';
    t += ' المنظومة المقترحة مبدئياً:*\n' + system_type + '\n' + SEP + '\n';
    t += ' هل ترغب بعرض سعر للمنظومة المقترحة مبدئياً؟\n\nاختر من الأزرار التالية _';
    return W(t);
  }
  function comVisitDateAsk() { return W(' يرجى تحديد الموعد المناسب للزيارة\n' + SEP + '\nاكتب اليوم والوقت المناسبين لك _\nمثال: السبت القادم 10 صباحاً'); }
  function comVisitFacilityAsk() { return W(' اسم المنشأة / النشاط التجاري\n' + SEP + '\nاكتب اسم المنشأة أو نوع النشاط _'); }
  function comVisitLocationAsk() { return locGovAsk(' موقع المنشأة التجارية\nيرجى اختيار المحافظة من القائمة التالية._'); }
  function comVisitDone() {
    return W(' تم تسجيل موعد الزيارة الميدانية بنجاح!*\n' + SEP + '\n الموعد ' + daily_hours + '\n المنشأة ' + main_loads + '\n الموقع ' + city + '\n' + SEP + '\nسيتواصل معك فريق أكتس لتأكيد الموعد._');
  }
  function notifComVisit() {
    var tsn = now.replace('T', ' ').substring(0, 16) + ' UTC';
    var t = AC + ' — طلب زيارة ميدانية (تجاري)\n' + SEP;
    t += '\n المنشأة: ' + main_loads;
    t += '\n الموقع: ' + city;
    t += '\n الموعد المطلوب: ' + daily_hours;
    t += '\n الاستهلاك الشهري: ' + Math.round(parseFloat(peak_load) || 0) + ' كيلووات';
    t += '\n الاستهلاك اليومي: ' + (Math.round((parseFloat(peak_load) || 0) / 30 * 10) / 10) + ' كيلووات/يوم';
    t += '\n المنظومة المقترحة: ' + system_type;
    t += '\n' + SEP + '\nالهاتف: ' + phone + '\nالوقت: ' + tsn;
    return t;
  }

  function billResult(lk, sysType) {
    return quoteProductsSummary(resQuoteItems(lk.code)) + '\n\nهل ترغب بعرض سعر رسمي؟ اختر من الأزرار التالية _';
  }

  function outOfRange() {
    return W(' نعتذر منك\n\nلا يوجد لدينا عرض سعر جاهز يطابق قيمة فاتورتك._\nسنوصلك بالموظف المختص وسيتواصل معك في أقرب وقت._\n ' + EMP_PHONE + '\n\nأرسل 0 للعودة إلى البداية._');
  }

  function buildNotif(type, data) {
    var ts = now.replace('T', ' ').substring(0, 16) + ' UTC';
    if (type === 'new') {
      return AC + ' — زيارة جديدة \n' + SEP + '\n دخل شخص للقائمة الرئيسية\n الهاتف: ' + phone + '\n الوقت: ' + ts;
    }
    var lines = [AC + ' — طلب جديد\n' + SEP];
    if (type === 'sup') {
      lines.push('النوع: دعم فني'); lines.push('العميل: ' + data.cn); lines.push('المدينة: ' + data.ci); lines.push('الجهاز: ' + data.dev); lines.push('المشكلة: ' + data.prob);
    } else if (type === 'con') {
      lines.push('النوع: تواصل'); lines.push('الاسم: ' + data.cn); lines.push('المشروع: ' + data.pt); lines.push('الخدمة: ' + data.sn);
    }
    lines.push(SEP); lines.push('الهاتف: ' + phone); lines.push('الوقت: ' + ts);
    return lines.join('\n');
  }

  function notifQuote(cname, mc, sysName, choice, outRange) {
    var typeNames2 = {'1':'سكني','2':'تجاري','3':'صناعي','4':'زراعي'};
    var tsn = now.replace('T', ' ').substring(0, 16) + ' UTC';
    var head = outRange ? (AC + ' — طلب عرض سعر (خارج النطاق)') : (AC + ' — طلب عرض سعر');
    var t = head + '\n' + SEP + '\nالاسم: ' + cname + '\nالنوع: ' + (typeNames2[choice] || '') + '\nالفاتورة الشهرية: ' + mc + ' ريال';
    if (!outRange) { t += '\nالمنظومة المقترحة: ' + sysName; }
    t += '\n' + SEP + '\nالهاتف: ' + phone + '\nالوقت: ' + tsn;
    return t;
  }


  // ===================== طلب صنف محدد (سلة + عرض سعر PDF) =====================
  var ITEM_CATS = {"pv": {"title": "الألواح الشمسية", "items": [["panel:595", "لوح سنتك N-Type 595 وات", "حبه", 110.0, "لوح"], ["panel:720", "لوح سنتك N-Type 720 وات", "حبه", 130.0, "لوح"]]}, "inv": {"title": "الانفرترات", "items": [["inverter:1.6:1", "انفرتر 1.6 كيلو سنجل فاز", "حبه", 180.0, "انفرتر"], ["inverter:6.2:1", "انفرتر 6.2 كيلو سنجل فاز", "حبه", 400.0, "انفرتر"], ["inverter:8:1", "انفرتر 8 كيلو سنجل فاز", "حبه", 1100.0, "انفرتر"], ["inverter:12:1", "انفرتر 12 كيلو سنجل فاز", "حبه", 1800.0, "انفرتر"], ["inverter:16:1", "انفرتر 16 كيلو سنجل فاز", "حبه", 2000.0, "انفرتر"], ["inverter:12:3", "انفرتر 12 كيلو ثري فاز", "حبه", 1650.0, "انفرتر"], ["inverter:16:3", "انفرتر 16 كيلو ثري فاز", "حبه", 2650.0, "انفرتر"], ["inverter:20:3", "انفرتر 20 كيلو ثري فاز", "حبه", 2600.0, "انفرتر"], ["inverter:50:3:deye", "انفرتر دايا هايبرد 50 كيلو ثري فاز (SUN-50K-SG01HP3-EU-BM3)", "حبه", 4030.0, "انفرتر"], ["inverter:50:3:solis", "انفرتر سوليز هايبرد 50 كيلو ثري فاز (S6-EH3P50K-H(21A))", "حبه", 4200.0, "انفرتر"]]}, "bat": {"title": "البطاريات", "items": [["battery:1.28", "بطارية ليثيوم 1.28 كيلو", "حبه", 220.0, "بطارية"], ["battery:2.56", "بطارية ليثيوم 2.56 كيلو", "حبه", 350.0, "بطارية"], ["battery:4", "بطارية ليثيوم 4 كيلو", "حبه", 420.0, "بطارية"], ["battery:5.12", "بطارية ليثيوم 5.12 كيلو", "حبه", 750.0, "بطارية"], ["battery:16", "بطارية ليثيوم 16 كيلو", "حبه", 1800.0, "بطارية"], ["battery:16:hv", "بطارية ليثيوم هيثيوم 16 كيلو هاي فولتج (LEGND112S-EPM-16HV)", "حبه", 2000.0, "بطارية"], ["bms:hv:16", "كنترول ربط بطاريات هيثيوم هاي فولتج (HEROEE-EPD-16HV)", "حبه", 1500.0, "كنترول"]]}, "acc": {"title": "الكابلات واللوحات", "items": [["cable", "كابل نحاس مجلفن 1500 فولت", "متر", 2.3, "متر"], ["dc:1", "لوحة حماية DC 1 خط", "حبه", 50.0, "لوحة"], ["dc:2", "لوحة حماية DC 2 خط", "حبه", 35.0, "لوحة"], ["dc:3", "لوحة حماية DC 3 خط", "حبه", 45.0, "لوحة"], ["dc:4", "لوحة حماية DC 4 خط", "حبه", 120.0, "لوحة"], ["ac:1", "لوحة حماية AC سنجل فاز", "حبه", 35.0, "لوحة"], ["ac:3", "لوحة حماية AC ثري فاز", "حبه", 50.0, "لوحة"], ["ac:3-100", "لوحة حماية AC ثري فاز 100 أمبير", "حبه", 120.0, "لوحة"], ["dc:4-4", "صندوق حماية DC 4 خط دخول 4 خط خروج", "حبه", 250.0, "صندوق"], ["bat:box:250", "صندوق حماية بطاريات قاطع MCCB-2P-250A", "حبه", 150.0, "صندوق"], ["ac:3-175", "صندوق حماية AC مولد-شبكة-أحمال 3 قواطع MCCB 175A 4P", "حبه", 550.0, "صندوق"], ["cable:10", "كابل نحاس مجلفن 1500 فولت مفرد 10 مم", "متر", 3.5, "متر"], ["cable:flex:4x50", "كابل نحاس فلكس شعيرات 4×50 ملي", "متر", 45.0, "متر"], ["cable:earth:6", "كابل نحاس أرت 1×6 مم", "متر", 2.0, "متر"], ["cable:earth:16", "كابل نحاس أرت 1×16 مم", "متر", 4.0, "متر"]]}, "ess": {"title": "منظومات تخزين الطاقة (كبائن وراكات)", "items": [["ess:cab:112", "كبينة بطارية هيثيوم 112 كيلو وات ساعة فلتية مرتفعة (LEGEND 112C)", "حبه", 18000.0, "كبينة"], ["ess:cab:313", "كبينة بطارية ليثيوم بايلونتك 313 كيلو وات ساعة (OPTIM US A300-HY)", "حبه", 50000.0, "كبينة"], ["ess:rack:104", "راك بطارية بايلونتك 104 كيلو وات ساعة 6000 دورة (H32148-C)", "حبه", 19000.0, "راك"], ["ess:rack:61.5", "راك بطارية بايلونتك 61.5 كيلو وات ساعة 6000 دورة (H32148-C)", "حبه", 11000.0, "راك"]]}, "saf": {"title": "السلامة والتأريض", "items": [["earth:pit", "حفرة تأريض مع جميع مكوناتها (سيخ 16 مم ملح فحم)", "حبه", 200.0, "حفرة"], ["fire:co2:6", "طفاية حريق ثاني اكسيد الكربون 6 كيلو", "حبه", 60.0, "طفاية"], ["fire:ball", "كرة حريق 1.5 كيلو", "حبه", 15.0, "كرة"]]}, "mnt": {"title": "القواعد والتركيب", "items": [["acc:install", "اكسسوارات ومستلزمات التركيب", "حبه", 400.0, "مجموعة"], ["labor:panel", "اجور تركيب منظومة شمسية (لكل لوح)", "لوح", 10.0, "لوح"]]}};
  var CAT_ORDER = ['pv', 'inv', 'bat', 'acc', 'ess', 'saf', 'mnt'];

  // ==== Dynamic catalog (معطّل) ====
  // كان هنا استدعاء عقدة Google Sheet غير موجودة في الوركفلو، فلم يكن يعمل إطلاقاً.
  // تمت إزالته والاعتماد على الكتالوج المدمج أعلاه.
  // لإعادة التفعيل: أضف عقدة Google Sheets قبل State Machine واقرأ صفوفها هنا.
  // ==== End dynamic catalog ====
  var CUR_LBL = 'دولار';

  function itemPrice(key, base) {
    if (ITEM_PRICES[key] != null && !isNaN(Number(ITEM_PRICES[key]))) { return Number(ITEM_PRICES[key]); }
    return Number(base || 0);
  }
  function money2(n) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function catOf(cid) { return ITEM_CATS[cid] || null; }
  function itemListMsg(cid) {
    var c = catOf(cid), t = '', i;
    if (!c) { return ''; }
    for (i = 0; i < c.items.length; i++) {
      var it = c.items[i];
      t += '' + (i + 1) + '* - ' + it[1] + '\n';
    }
    return t;
  }
  function itemPickIn(cid, txt) {
    var c = catOf(cid);
    if (!c) { return null; }
    var n = parseInt(String(txt).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n >= 1 && n <= c.items.length) { return c.items[n - 1]; }
    return null;
  }
  function itemNotAvailable(again) {
    return noOpt(again);
  }
  function itemMenuMsg() {
    return W(' طلب صنف محدد\n' + SEP + '\nاختر نوع الصنف الذي ترغب بإضافته إلى عرض السعر:_\n\n1 - ألواح\n2 - انفرترات\n3 - بطاريات\n4 - كابلات ولوحات\n5 - منظومات تخزين (كبائن وراكات)\n6 - السلامة والتأريض\n7 - القواعد والتركيب\n\nأرسل 0 للعودة إلى البداية._');
  }
  function askQty(unitWord) {
    return W(' تحديد الكمية\n' + SEP + '\nكم ' + unitWord + ' تحتاج؟\nاكتب الرقم فقط');
  }
  function cartTotal() {
    var s = 0, i;
    for (i = 0; i < cart.length; i++) { s += Number(cart[i].total) || 0; }
    return s;
  }
  function cartLines(withPrice) {
    var t = '', i;
    for (i = 0; i < cart.length; i++) {
      var it = cart[i];
      if (withPrice) {
        t += '' + (i + 1) + '* - ' + it.name + '\n_' + it.qty + ' ' + it.unit + ' × ' + money2(it.price) + ' = ' + money2(it.total) + ' ' + CUR_LBL + '_\n';
      } else {
        t += '' + (i + 1) + '* - ' + it.name + '\nالكمية: ' + it.qty + ' ' + it.unit + '_\n';
      }
    }
    return t;
  }
  function cartMsg(head) {
    return W((head ? head + '\n' + SEP + '\n' : '') + ' سلة الطلب\n' + SEP + '\n' + cartLines(false) + SEP +
      '\n\n1 - إضافة صنف آخر\n2 - طلب عرض سعر\n3 - إفراغ السلة\n0 - العودة إلى البداية');
  }
  function itemNextMsg(head) {
    return W((head ? head + '\n' + SEP + '\n' : '') + ' ما الذي تريد إضافته أيضاً؟\n' + SEP + '\n' +
      cartLines(false) + SEP +
      '\n\n1 - ألواح شمسية\n2 - لوحات وكابلات\n3 - طلب عرض سعر\n4 - إضافة صنف آخر\n0 - العودة إلى البداية');
  }
  function catAskMsg(cid) {
    return W(' *' + catOf(cid).title + '\n' + SEP + '\nاختر الصنف المطلوب:_\n\n' + itemListMsg(cid));
  }
  function askItemName() {
    return W(' طلب عرض سعر\n' + SEP + '\nيرجى إدخال اسم العميل ليُكتب في عرض السعر.\nإذا كان الاسم المسجل في طلبك السابق صحيحاً، يمكنك اختياره من الزر أدناه:_');
  }
  function addToCart(entry, qty) {
    var price = itemPrice(entry[0], entry[3]);
    var i;
    for (i = 0; i < cart.length; i++) {
      if (cart[i].key === entry[0]) {
        cart[i].qty = Number(cart[i].qty) + qty;
        cart[i].price = price;
        cart[i].total = cart[i].qty * price;
        return;
      }
    }
    cart.push({ key: entry[0], name: entry[1], unit: entry[2], qty: qty, price: price, total: qty * price });
  }
  function notifItemQuote(qnum) {
    var tsi = now.replace('T', ' ').substring(0, 16) + ' UTC';
    return AC + ' — طلب صنف محدد (عرض سعر ' + qnum + ')\n' + SEP + '\n' + cartLines(true) +
      SEP + '\nالعميل: ' + (customer_name || '-') + '\n' + fxLines(cartTotal()) + '\nالهاتف: ' + phone + '\nالوقت: ' + tsi;
  }
  function issueItemQuote() {
    var qnum = 'ACTES-Q' + String(Date.now()).slice(-6);
    quote_items = stripBaseItems(cart.slice(0));
    quote_number = qnum;
    item_quote = true;
    send_quote_file = true;
    notify_employee = true;
    notification_text = notifItemQuote(qnum);
    response = W(' تم تجهيز طلبك\n' + SEP + '\nالعميل: ' + (customer_name || '-') + '\n' + SEP + '\n' + cartLines(true) + SEP + '\n' + fxLines(cartTotal()).split('\n').join('\n') + '\n' + SEP +
      '\nجارٍ إصدار عرض السعر PDF وإرساله لك خلال لحظات._\n\nأرسل 0 للعودة إلى البداية._');
    cart = [];
    // طلب صنف محدد : لا يُسأل العميل عن مخطط SLD
    step = 'buy_ask';
    followup_kind = 'buy';
  }

  var pv_flow = false;
  // ===================== مسار دراسة PVsyst للعميل =====================
  var S_PANELS = {
    p595: { model: 'Suntech STP595S-C54/Nshm+ Bifacial', wp: 595, voc: 53.96, vmp: 45.53, imp: 13.07, isc: 13.97 },
    p720: { model: 'Suntech STP720S-D66/Nsh+ Bifacial TOPCon', wp: 720, voc: 48.45, vmp: 40.45, imp: 17.81, isc: 18.83 }
  };
  var S_INV = [
    { key: 'lp16', model: 'Li Power Hybrid 1.6kW / 12V', item: 'inverter:1.6:1', kwac: 1.6, pvmax: 2.0, vmin: 30, vmax: 500, mppt: 1, ph: 1, vbat: 12 },
    { key: 'lp62', model: 'Li Power Hybrid 6.2kW / 48V', item: 'inverter:6.2:1', kwac: 6.2, pvmax: 8.5, vmin: 60, vmax: 500, mppt: 2, ph: 1, vbat: 48 },
    { key: 'deye8', model: 'Deye SUN-8K-SG01LP1-EU', item: 'inverter:8:1', kwac: 8, pvmax: 10.4, vmin: 150, vmax: 500, mppt: 2, ph: 1, vbat: 48 },
    { key: 'deye12s', model: 'Deye SUN-12K-SG04LP1-EU', item: 'inverter:12:1', kwac: 12, pvmax: 15.6, vmin: 150, vmax: 500, mppt: 2, ph: 1, vbat: 48 },
    { key: 'deye16', model: 'Deye SUN-16K-SG01LP1-EU', item: 'inverter:16:1', kwac: 16, pvmax: 20.8, vmin: 150, vmax: 500, mppt: 2, ph: 1, vbat: 48 },
    { key: 'deye12', model: 'Deye SUN-12K-SG04LP3-EU (3 فاز)', item: 'inverter:12:3', kwac: 12, pvmax: 15.6, vmin: 160, vmax: 800, mppt: 2, ph: 3, vbat: 48 },
    { key: 'deye16t', model: 'Deye SUN-16K-SG01HP3-EU (3 فاز)', item: 'inverter:16:3', kwac: 16, pvmax: 20.8, vmin: 160, vmax: 800, mppt: 2, ph: 3, vbat: 48 },
    { key: 'deye20', model: 'Deye SUN-20K-SG01HP3-EU (3 فاز)', item: 'inverter:20:3', kwac: 20, pvmax: 26.0, vmin: 160, vmax: 800, mppt: 2, ph: 3, vbat: 48 },
    { key: 'deye50', model: 'Deye SUN-50K-SG01HP3-EU-BM3 (3 فاز)', item: 'inverter:50:3:deye', kwac: 50, pvmax: 65.0, vmin: 200, vmax: 1000, mppt: 3, ph: 3, vbat: 48 },
    { key: 'solis50', model: 'Solis S6-EH3P50K-H(21A) (3 فاز)', item: 'inverter:50:3:solis', kwac: 50, pvmax: 96.0, vmin: 150, vmax: 1000, mppt: 4, ph: 3, vbat: 150, vbatMin: 150, vbatMax: 800 }
  ];
  var S_BAT = [
    { key: 'rv12100', model: 'Pylontech RV12100', item: 'battery:1.28', kwh: 1.28, v: 12.8, dod: 90 },
    { key: 'rv12200', model: 'Pylontech RV12200', item: 'battery:2.56', kwh: 2.56, v: 12.8, dod: 90 },
    { key: 'hth4', model: 'HTHIUM HeroEE Neo 4', item: 'battery:4', kwh: 4, v: 12.8, dod: 90 },
    { key: 'uf5000', model: 'Pylontech UF5000', item: 'battery:5.12', kwh: 5.12, v: 51.2, dod: 90 },
    { key: 'fidus16', model: 'Pylontech Fidus FB-L-16-PRO', item: 'battery:16', kwh: 16, v: 51.2, dod: 97 },
    { key: 'ess615', model: 'Pylontech H32148-C Rack 61.5 kWh', item: 'ess:rack:61.5', kwh: 61.5, v: 51.2, dod: 95 },
    { key: 'ess104', model: 'Pylontech H32148-C Rack 104 kWh', item: 'ess:rack:104', kwh: 104, v: 51.2, dod: 95 },
    { key: 'ess112', model: 'HTHIUM LEGEND 112C Cabinet 112 kWh', item: 'ess:cab:112', kwh: 112, v: 51.2, dod: 95 },
    { key: 'ess313', model: 'Pylontech OPTIM US A300-HY Cabinet 313 kWh', item: 'ess:cab:313', kwh: 313, v: 51.2, dod: 95 }
  ];

  var GOVS = [
    { n: 'صنعاء (أمانة العاصمة)', d: ['أزال', 'التحرير', 'الجراف', 'الثورة', 'الحصبة', 'بني الحارث', 'السبعين', 'سعوان', 'شعوب', 'صافية', 'معين', 'الوحدة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'صنعاء', d: ['أرحب', 'الطيال', 'بني بهلول (سنحان)', 'بني حشيش', 'بني مطر', 'بني ضبيان', 'بلاد الروس', 'جحانة', 'الحصن', 'الحيمة الداخلية', 'الحيمة الخارجية', 'خولان', 'صعفان', 'همدان', 'مناخة', 'نهم', 'أخرى / منطقة غير مدرجة'] },
    { n: 'عدن', d: ['كريتر', 'المعلا', 'التواهي', 'خور مكسر', 'الشيخ عثمان', 'المنصورة', 'دار سعد', 'البريقة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'تعز', d: ['المظفر', 'القاهرة', 'صالة', 'التعزية', 'صبر الموادم', 'الشمايتين', 'خدير', 'حيفان', 'المسراخ', 'المواسط', 'ماوية', 'المعافر', 'جبل حبشي', 'مقبنة', 'شرعب السلام', 'شرعب الرونة', 'الصلو', 'المخا', 'ذباب', 'موزع', 'الوازعية', 'الجند', 'سامع', 'أخرى / منطقة غير مدرجة'] },
    { n: 'الحديدة', d: ['الحالي', 'الحوك', 'الميناء', 'باجل', 'بيت الفقيه', 'برع', 'التحيتا', 'الجراحي', 'جبل رأس', 'حيس', 'الخوخة', 'الدريهمي', 'الضحى', 'الزيدية', 'السخنة', 'الصليف', 'القناوص', 'كمران', 'اللحية', 'المغلاف', 'المراوعة', 'المنصورية', 'زبيد', 'الحسينية', 'وادي مور', 'كعيدنة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'إب', d: ['الظهار', 'المشنة', 'ريف إب', 'جبلة', 'بعدان', 'يريم', 'الرضمة', 'السبرة', 'السياني', 'الشعر', 'ذي السفال', 'السدة', 'النادرة', 'فرع العدين', 'حبيش', 'حزم العدين', 'العدين', 'القفر', 'المخادر', 'مذيخرة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'ذمار', d: ['مدينة ذمار', 'الحداء', 'جبل الشرق', 'جهران', 'ضوران آنس', 'عتمة', 'عنس', 'مغرب عنس', 'ميفعة عنس', 'المنار', 'وصاب العالي', 'وصاب السافل', 'أخرى / منطقة غير مدرجة'] },
    { n: 'حضرموت', d: ['المكلا', 'أرياف المكلا', 'الشحر', 'غيل باوزير', 'الديس الشرقية', 'الريدة وقصيعر', 'بروم ميفع', 'الحامي', 'حجر', 'رماه', 'ثمود', 'القف', 'الضليعة', 'السوم', 'سيئون', 'تريم', 'شبام', 'القطن', 'ساه', 'عمد', 'دوعن', 'رخية', 'حوره ووادي العين', 'يبعث', 'العبر', 'جثمة', 'وادي خلة', 'حريضة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'لحج', d: ['الحوطة', 'تبن', 'طور الباحة', 'المقاطرة', 'المضاربة والعارة', 'يهر', 'حالمين', 'ردفان', 'الملاح', 'حبيل جبر', 'القبيطة', 'المسيمير', 'الحد', 'الصبيحة', 'المفلحي', 'أخرى / منطقة غير مدرجة'] },
    { n: 'أبين', d: ['زنجبار', 'خنفر', 'سرار', 'سباح', 'رصد', 'أحور', 'المحفد', 'مودية', 'جيشان', 'لودر', 'الوضيع', 'أخرى / منطقة غير مدرجة'] },
    { n: 'الضالع', d: ['الضالع', 'قعطبة', 'دمت', 'جبن', 'الأزارق', 'الشعيب', 'الحشاء', 'الحصين', 'مريس', 'أخرى / منطقة غير مدرجة'] },
    { n: 'شبوة', d: ['عتق', 'بيحان', 'عسيلان', 'عين', 'حبان', 'حطيب', 'جردان', 'دهر', 'رضوم', 'الروضة', 'الصعيد', 'الطلح', 'ميفعة', 'مرخة العليا', 'مرخة السفلى', 'نصاب', 'السعيد', 'أخرى / منطقة غير مدرجة'] },
    { n: 'مأرب', d: ['مدينة مأرب', 'صرواح', 'مجزر', 'مدغل', 'رغوان', 'رحبة', 'حريب', 'حريب القراميش', 'العبدية', 'الجوبة', 'جبل مراد', 'بدبدة', 'ماهلية', 'الوادي', 'أخرى / منطقة غير مدرجة'] },
    { n: 'الجوف', d: ['الحزم', 'المتون', 'المطمة', 'الزاهر', 'الغيل', 'برط العنان', 'الحميدات', 'خب والشعف', 'خراب المراشي', 'رجوزة', 'المصلوب', 'اليتمة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'صعدة', d: ['صعدة', 'باقم', 'الحشوة', 'الصفراء', 'غمر', 'رازح', 'شدا', 'صحار', 'قطابر', 'كتاف والبقع', 'مجز', 'منبه', 'سحار', 'ساقين', 'حيدان', 'أخرى / منطقة غير مدرجة'] },
    { n: 'حجة', d: ['حجة', 'عبس', 'حرض', 'ميدي', 'حيران', 'مستبأ', 'بكيل المير', 'بني قيس', 'الشغادرة', 'شرس', 'أفلح الشام', 'أفلح اليمن', 'أسلم', 'بني العوام', 'بلاد الطعام', 'الشاهل', 'المحابشة', 'قارة', 'قفل شمر', 'كحلان الشرف', 'كحلان عفار', 'كعيدنة', 'مبين', 'وشحة', 'وضرة', 'مغربة', 'نجرة', 'خيران المحرق', 'الطور', 'بني العمري', 'الزهرة', 'أخرى / منطقة غير مدرجة'] },
    { n: 'عمران', d: ['عمران', 'ذيبين', 'خمر', 'حبور ظليمة', 'سودة', 'العشة', 'ريدة', 'جبل عيال يزيد', 'حرف سفيان', 'مسور', 'بني صريم', 'ثلاء', 'حوث', 'قفلة عذر', 'صوير', 'شهارة', 'السود', 'المدان', 'عيال سريح', 'غمر', 'أخرى / منطقة غير مدرجة'] },
    { n: 'المحويت', d: ['مدينة المحويت', 'الرجم', 'حفاش', 'الطويلة', 'ملحان', 'بني سعد', 'شبام كوكبان', 'الخبت', 'أخرى / منطقة غير مدرجة'] },
    { n: 'البيضاء', d: ['البيضاء', 'رداع', 'السوادية', 'الرياشية', 'الشرية', 'الصومعة', 'الطفة', 'العرش', 'القريشية', 'الزاهر', 'ذي ناعم', 'مسورة', 'مكيراس', 'ناطع', 'نعمان', 'ولد ربيع', 'قانية', 'ردمان', 'الملاجم', 'صباح', 'أخرى / منطقة غير مدرجة'] },
    { n: 'ريمة', d: ['الجبين', 'كسمة', 'السلفية', 'بلاد الطعام', 'بني الضبيبي', 'مزهر', 'أخرى / منطقة غير مدرجة'] },
    { n: 'المهرة', d: ['الغيضة', 'حصوين', 'قشن', 'المسيلة', 'سيحوت', 'منعر', 'حات', 'حوف', 'شحن', 'أخرى / منطقة غير مدرجة'] },
    { n: 'سقطرى', d: ['حديبو', 'قلنسية وعبد الكوري', 'أخرى / منطقة غير مدرجة'] }
  ];


  // ===== حذف قواعد/هياكل تثبيت الألواح من جميع عروض الأسعار =====
  function isPanelBaseItem(it) {
    var t = '';
    if (!it) { return false; }
    if (typeof it === 'string') { t = it; }
    else if (Object.prototype.toString.call(it) === '[object Array]') { t = String(it[0] || ''); }
    else { t = String(it.title || it.name || it.description || ''); }
    var k = String((it && it.key) || '');
    if (k === 'base:3m') { return true; }
    return /(قاعدة|قواعد|هيكل|هياكل|حوامل)\s*(\/\s*هيكل\s*)?(تثبيت\s*)?(ال)?[أا]لواح/.test(t);
  }
  function stripBaseItems(list) {
    if (Object.prototype.toString.call(list) !== '[object Array]') { return list; }
    return actesNormalize(list.filter(function (it) { return !isPanelBaseItem(it); }), {});
  }

  function locApply(_base) {
      if (_base === 'pv_site') {
        var _pvSiteData = pvLoad();
        if (_pvSiteData && _pvSiteData.l && _pvSiteData.l.length === 24 && _pvSiteData.m) {
          _pvSiteData.c = city;
          pvSave(_pvSiteData);
          var _pvSiteDesign = pvDesign();
          send_study_file = true;
          pv_flow = true;
          study_params = pvStudyParams(_pvSiteDesign, city, _pvSiteData.l, quote_number || ('ACT-STUDY-' + String(Date.now()).slice(-6)));
          step = 'pv_sld_ask';
          followup_kind = 'sld';
          response = '';
        } else {
          pvSave({ l: [], c: '', m: '' });
          city = '';
          step = 'pv_loads';
          response = W(' تعذر استرجاع بيانات المنظومة، يرجى إعادة إدخال الأحمال._') + '\n' + loadsTableMsg();
        }
      } else if (_base === 'ind_loc') {
        indSet({ c: city }); step = 'ind_activity'; response = indActivityAsk();
      } else if (_base === 'study_city') {
        send_study_file = true; step = 'sld_ask'; response = ''; followup_kind = 'sld';
      } else if (_base === 'study_city_sld') {
        var __sldItems2 = (quote_context && Array.isArray(quote_context.quote_items)) ? quote_context.quote_items :
          (Array.isArray(quote_items) && quote_items.length ? quote_items : []);
        sld_params = {
          quote_number: quote_number || (quote_context && quote_context.quote_number) || '',
          customer_name: customer_name || (quote_context && quote_context.customer_name) || '',
          city_en: city || (quote_context && quote_context.city) || '',
          quote_items: __sldItems2,
          quote_source: 'FORMAL_QUOTATION_SNAPSHOT'
        };
        make_sld = true; step = 'buy_ask'; response = ''; followup_kind = '';
      } else if (_base === 'sup_city') {
        step = 'sup_device'; response = SEP + '\n نوع الجهاز / النظام الذي فيه المشكلة :_';
      } else if (_base === 'buy_location') {
        step = 'pay_method'; response = payMethodAsk();
      } else if (_base === 'com_visit_location') {
        notify_employee = true;
        notification_text = notifComVisit();
        step = 'com_quote_ask';
        response = comVisitDone() + '\n\n' + m('quote_next');
      } else {
        step = 'buy_ask'; response = buyAskMsg();
      }
  }

  var LOC_BASE = { ind_loc: 1, pv_site: 1, study_city: 1, study_city_sld: 1, buy_location: 1, com_visit_location: 1, sup_city: 1 };
  var LOC_PAGE_SIZE = 9;
  function locPages(total) { return Math.max(1, Math.ceil(total / LOC_PAGE_SIZE)); }
  function govPage() { var mp = String(city || '').match(/^PG:(\d+)$/); var p = mp ? parseInt(mp[1], 10) : 1; return (p >= 1 && p <= locPages(GOVS.length)) ? p : 1; }
  function distParts() { return String(city || '').split('|'); }
  function distPage(total) { var pp = parseInt(distParts()[2], 10); return (pp >= 1 && pp <= locPages(total)) ? pp : 1; }
  var LOC_TITLE = '';
  function locGovAsk(title) {
    if (title) { LOC_TITLE = String(title); }
    var pg = govPage(), tp = locPages(GOVS.length);
    var s = (LOC_TITLE || ' تحديد الموقع') + '\n' + SEP + '\n\nلضبط بيانات طلبك بدقة، يرجى تحديد المحافظة التي يوجد فيها المشروع أو موقع التسليم.\n\nاختر إحدى المحافظات التالية، وإذا كانت محافظتك غير موجودة اختر «محافظة أخرى» ثم اكتب اسم المحافظة._\n\nأرسل 0 للعودة إلى البداية._';
    return W(s);
  }
  function locGovOtherAsk(remainingOnly) {
    var rows = [];
    for (var oi = 0; oi < GOVS.length; oi++) {
      var __gn = String(GOVS[oi].n || '');
      if (remainingOnly && (__gn === 'صنعاء (أمانة العاصمة)' || __gn === 'عدن' || __gn === 'صنعاء')) { continue; }
      rows.push({ id: 'gov_other_' + (oi + 1), title: __gn });
    }
    rows.push({ id: 'back_step', title: 'العودة خطوة' });
    return { kind: 'list', locList: true, button: 'اختر المحافظة', sections: [ { title: remainingOnly ? 'باقي محافظات الجمهورية اليمنية' : 'جميع محافظات الجمهورية اليمنية', rows: rows } ] };
  }
  function locDistAsk(gi) {
    var g = GOVS[gi - 1];
    var pg2 = distPage(g.d.length), tp2 = locPages(g.d.length);
    var s = (LOC_TITLE || ' تحديد الموقع') + '\n' + SEP + '\n\nاختر موقعك من القائمة بالأسفل._\n' + g.n + ' ▸ المناطق' + (tp2 > 1 ? '\n_(صفحة ' + pg2 + ' من ' + tp2 + ' — اختر «عرض المزيد»)_' : '') + '\n\nأرسل 0 للعودة إلى البداية._';
    return W(s);
  }


  function pvSiteAsk() {
    return locGovAsk('أكتس لأنظمة الطاقة وحلولها\n\n دراسة المحاكاة الشمسية PVsyst\n\nقبل البدء نحدد موقع المشروع لجلب بيانات الإشعاع الشمسي الخاصة به._');
  }
  // Default 24-hour load distribution supplied by the user.
  // The percentages add up to 99%, so generated hourly values are normalized by 99
  // to preserve the entered monthly consumption exactly.
  var DEFAULT_HOURLY_LOAD_PCT = [3,2,2,2,2,3,3,4,4,4,5,5,5,5,5,5,5,5,6,6,6,5,4,3];
  var DEFAULT_HOURLY_LOAD_PCT_SUM = DEFAULT_HOURLY_LOAD_PCT.reduce(function(a,b){ return a+b; }, 0);
  function monthlyLoadProfile(monthlyKwh) {
    var mk = Number(monthlyKwh);
    if (!isFinite(mk) || mk <= 0) return null;
    var daily = mk / 30;
    var hourly = [];
    var normalizedPct = [];
    for (var h = 0; h < 24; h++) {
      var p0 = DEFAULT_HOURLY_LOAD_PCT[h] / DEFAULT_HOURLY_LOAD_PCT_SUM * 100;
      normalizedPct.push(p0);
      hourly.push(daily * DEFAULT_HOURLY_LOAD_PCT[h] / DEFAULT_HOURLY_LOAD_PCT_SUM);
    }
    return { monthlyKwh: mk, dailyKwh: daily, hourlyKwh: hourly, rawPct: DEFAULT_HOURLY_LOAD_PCT.slice(), normalizedPct: normalizedPct, pctSum: DEFAULT_HOURLY_LOAD_PCT_SUM };
  }
  function parseMonthlyKwh(raw) {
    var s = normalizeInputDigits(String(raw || '')).replace(/,/g, '');
    var ms = s.match(/(?:الاستهلاك|استهلاك|monthly|month|kwh|كيلووات|كيلو واط)?[^0-9]*(\d+(?:\.\d+)?)/i);
    if (!ms) return NaN;
    var v = Number(ms[1]);
    return isFinite(v) && v > 0 ? v : NaN;
  }
  function loadsTableMsg() {
    var s = ' دراسة PVsyst — إدخال الاستهلاك الشهري\n\n';
    s += 'أدخل الاستهلاك الشهري بالكيلووات ساعة فقط. مثال: 900\n\n';
    s += 'سيتم حساب الحمل اليومي تلقائياً: الاستهلاك الشهري ÷ 30.\n';
    s += 'ثم يتم توزيع الحمل على 24 ساعة وفق منحنى الأحمال المعتمد في الدراسة.\n\n';
    s += 'ويمكنك أيضاً إرسال 24 قيمة ساعية يدوياً إذا كانت لديك بيانات فعلية.\n';
    s += '\nأرسل 0 للعودة إلى البداية.';
    return s;
  }
  function parseLoads(raw) {
    var lines = String(raw || '').split(/\r?\n/);
    var arr = new Array(24); for (var z = 0; z < 24; z++) { arr[z] = null; }
    var filled = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/[٠-٩]/g, function (dd) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(dd)); });
      var mm = ln.match(/^\s*(\d{1,2})\s*(?::\s*\d{2})?\s*[:=\-–]\s*(\d+(?:[\.,]\d+)?)/);
      if (mm) {
        var hIdx = Number(mm[1]); var val = Number(String(mm[2]).replace(',', '.'));
        if (hIdx >= 0 && hIdx <= 23 && isFinite(val)) { arr[hIdx] = val; filled++; }
      }
    }
    if (filled < 6) {
      var flat = String(raw || '').replace(/[٠-٩]/g, function (dd) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(dd)); });
      var nums = (flat.match(/\d+(?:[\.,]\d+)?/g) || []).map(function (x) { return Number(String(x).replace(',', '.')); });
      if (nums.length >= 24) { arr = nums.slice(0, 24); filled = 24; }
      else { return null; }
    }
    for (var j = 0; j < 24; j++) { if (arr[j] == null || !isFinite(arr[j])) { arr[j] = 0; } }
    var sum = 0; for (var k2 = 0; k2 < 24; k2++) { sum += arr[k2]; }
    if (sum <= 0) { return null; }
    return arr;
  }
  function sizeSystem(loads, sysMode) {
    var daily = 0, peak = 0, day = 0;
    for (var h = 0; h < 24; h++) {
      daily += loads[h];
      if (loads[h] > peak) { peak = loads[h]; }
      if (h >= 6 && h <= 17) { day += loads[h]; }
    }
    var night = daily - day;
    var dayPct = Math.round(day / daily * 100);
    var needAc = peak * 1.25;
    var PSH = 5.6;
    var PR = (sysMode === 'on') ? 0.80 : 0.72;
    var kWpNeed = daily / (PSH * PR);
    var pan = (kWpNeed >= 3) ? S_PANELS.p720 : S_PANELS.p595;
    var panKey = (kWpNeed >= 3) ? 'p720' : 'p595';
    var nPan = Math.max(1, Math.ceil(kWpNeed * 1000 / pan.wp));
    var kWpTot = nPan * pan.wp / 1000;
    // اختيار الانفرتر من كامل أصناف البوت (سنجل فاز / ثري فاز كل الأحجام)
    // القاعدة: أنسب صنف يغطي القدرة اللحظية وقدرة الألواح بأقل عدد وحدات وأقل زيادة
    var maxSingle = 0, ci0;
    for (ci0 = 0; ci0 < S_INV.length; ci0++) { if (S_INV[ci0].ph === 1 && S_INV[ci0].kwac > maxSingle) { maxSingle = S_INV[ci0].kwac; } }
    var pref3 = needAc > maxSingle;
    var chosen = null, nInv = 1, bestScore = -1, ci1;
    for (ci1 = 0; ci1 < S_INV.length; ci1++) {
      var c = S_INV[ci1];
      if (pref3 && c.ph !== 3) { continue; }
      if (!pref3 && c.ph !== 1) { continue; }
      var nA = Math.ceil(needAc / c.kwac);
      var nP = Math.ceil(kWpTot / c.pvmax);
      var n = Math.max(1, nA, nP);
      if (n > 10) { continue; }
      // كلما قلّت الزيادة في القدرة والعدد كان الصنف أنسب
      var over = (n * c.kwac / needAc - 1) + (n * c.pvmax / kWpTot - 1) * 0.5;
      var score = over + (n - 1) * 0.35;
      if (bestScore < 0 || score < bestScore) { bestScore = score; chosen = c; nInv = n; }
    }
    if (!chosen) {
      // حِمل أكبر من كل الأصناف : أكبر انفرتر ثري فاز مع تعدد الوحدات
      for (ci1 = 0; ci1 < S_INV.length; ci1++) { if (S_INV[ci1].ph === 3 && (!chosen || S_INV[ci1].kwac > chosen.kwac)) { chosen = S_INV[ci1]; } }
      if (!chosen) { chosen = S_INV[S_INV.length - 1]; }
      nInv = Math.max(1, Math.ceil(needAc / chosen.kwac), Math.ceil(kWpTot / chosen.pvmax));
    }
    while (nPan * pan.wp / 1000 > chosen.pvmax * nInv) { nInv += 1; }
    kWpTot = nPan * pan.wp / 1000;
    var maxPerStr = Math.max(1, Math.floor(chosen.vmax * 0.85 / pan.voc));
    var minPerStr = Math.max(1, Math.ceil(chosen.vmin * 1.15 / pan.vmp));
    if (chosen.vbat === 12) { maxPerStr = Math.min(maxPerStr, 4); minPerStr = 1; }
    if (minPerStr > maxPerStr) { minPerStr = maxPerStr; }
    var perStr = maxPerStr;
    var nStr = Math.ceil(nPan / perStr);
    var STR_PER_MPPT = 2; // each MPPT accepts up to 2 strings (same Vmp/Imp/panel type)
    var mpptTotal = chosen.mppt * nInv;
    if (nStr < mpptTotal && nPan >= mpptTotal * minPerStr) { nStr = mpptTotal; }
    perStr = Math.ceil(nPan / nStr);
    if (perStr < minPerStr) { perStr = minPerStr; nStr = Math.ceil(nPan / perStr); }
    // MPPT capacity : add inverters until every string has an MPPT input
    while (nStr > chosen.mppt * STR_PER_MPPT * nInv && nInv < 30) { nInv += 1; }
    mpptTotal = chosen.mppt * nInv;
    if (nStr > mpptTotal * STR_PER_MPPT) { nStr = mpptTotal * STR_PER_MPPT; perStr = Math.ceil(nPan / nStr); }
    // balance strings across inverters as equally as possible (identical strings => equal power)
    if (nInv > 1 && nStr % nInv !== 0) {
      var upStr = Math.ceil(nStr / nInv) * nInv;
      if (upStr <= mpptTotal * STR_PER_MPPT) { nStr = upStr; perStr = Math.ceil(nPan / nStr); if (perStr < minPerStr) { perStr = minPerStr; } }
    }
    nPan = perStr * nStr;
    var strPerInv = [], bs0 = Math.floor(nStr / nInv), rm0 = nStr % nInv;
    for (var qq = 0; qq < nInv; qq++) { strPerInv.push(bs0 + (qq < rm0 ? 1 : 0)); }
    var needKwh = 0;
    if (sysMode === 'off') { needKwh = night * 1.35 + daily * 0.35; }
    else if (sysMode === 'hyb') { needKwh = night * 1.15; }
    var batKey = 'uf5000', bat = S_BAT[3], nBat = 0;
    if (needKwh > 0) {
      // اختيار البطارية / منظومة التخزين من كامل أصناف البوت
      var bBest = -1, bi;
      for (bi = 0; bi < S_BAT.length; bi++) {
        var cb = S_BAT[bi];
        if (chosen.vbat === 12 && cb.v > 20) { continue; }
        if (chosen.vbat !== 12 && cb.v < 20) { continue; }
        var use = cb.kwh * cb.dod / 100;
        var nb = Math.max(1, Math.ceil(needKwh / use));
        if (nb > 12) { continue; }
        var sc = (nb * use - needKwh) + (nb - 1) * 1.5;
        if (bBest < 0 || sc < bBest) { bBest = sc; bat = cb; nBat = nb; }
      }
      if (bBest < 0) {
        bat = S_BAT[S_BAT.length - 1];
        nBat = Math.max(1, Math.ceil(needKwh / (bat.kwh * bat.dod / 100)));
      }
      batKey = bat.key;
    }
    return {
      daily: daily, peak: peak, day: day, night: night, dayPct: dayPct,
      inv: chosen, nInv: nInv, pan: pan, panKey: panKey, nPan: nPan,
      kWp: nPan * pan.wp / 1000, nStr: nStr, perStr: perStr, strVoc: perStr * pan.voc, strVmp: perStr * pan.vmp,
      bat: bat, batKey: batKey, nBat: nBat, batKwh: bat.kwh * nBat,
      mppt: chosen.mppt * nInv, mpptPerInv: chosen.mppt, strPerMppt: STR_PER_MPPT, strPerInv: strPerInv, sysMode: sysMode, needKwh: needKwh
    };
  }
  function pvSysLabel(mm2) { return mm2 === 'on' ? 'On-Grid (متصل بالشبكة)' : (mm2 === 'off' ? 'Off-Grid (مستقل)' : 'Hybrid (هجين)'); }
  function pvSysLabelEn(mm2) { return mm2 === 'on' ? 'ON-GRID' : (mm2 === 'off' ? 'OFF-GRID' : 'HYBRID'); }
  var PV_CITY_EN = { 'صنعاء': 'SANAA', 'عدن': 'ADEN', 'تعز': 'TAIZ', 'الحديدة': 'HODEIDAH', 'إب': 'IBB', 'اب': 'IBB', 'المكلا': 'MUKALLA', 'حضرموت': 'HADRAMOUT', 'مأرب': 'MARIB', 'مارب': 'MARIB', 'ذمار': 'DHAMAR', 'حجة': 'HAJJAH', 'صعدة': 'SAADA', 'عمران': 'AMRAN', 'البيضاء': 'AL BAYDA', 'لحج': 'LAHJ', 'أبين': 'ABYAN', 'ابين': 'ABYAN', 'شبوة': 'SHABWA', 'المهرة': 'AL MAHRA', 'سقطرى': 'SOCOTRA', 'الجوف': 'AL JAWF', 'الضالع': 'AL DHALE', 'ريمة': 'RAYMAH' };
  function pvCityEn(c) {
    var k = String(c || '').trim();
    if (!k) { return 'SANAA'; }
    var keys = Object.keys(PV_CITY_EN);
    for (var i = 0; i < keys.length; i++) { if (k.indexOf(keys[i]) >= 0) { return PV_CITY_EN[keys[i]]; } }
    if (/^[\x20-\x7E]+$/.test(k)) { return k.toUpperCase(); }
    return 'SANAA';
  }
  function pvAsc(s) { return String(s || '').replace(/3\sفاز/g, '3PH').replace(/[^\x20-\x7E]/g, '').replace(/\(\s\)/g, '').replace(/\s{2,}/g, ' ').trim(); }
  function pvSizingText(z, cty) {
    var s = ' نتيجة تصميم منظومتك (PVsyst)*\n';
    s += SEP + '\n';
    if (cty) { s += ' الموقع: ' + cty + '\n'; }
    s += ' نوع المنظومة: ' + pvSysLabel(z.sysMode) + '\n\n';
    s += 'أولاً: الأحمال\n';
    s += '• الاستهلاك اليومي: ' + z.daily.toFixed(2) + ' كيلو وات ساعة\n';
    s += '• أعلى حمل لحظي: ' + z.peak.toFixed(2) + ' كيلو وات\n';
    s += '• أحمال النهار: ' + z.day.toFixed(2) + ' kWh (' + z.dayPct + '%)\n';
    s += '• أحمال الليل: ' + z.night.toFixed(2) + ' kWh\n\n';
    s += 'ثانياً: الانفرترات\n';
    s += '• العدد: ' + z.nInv + ' انفرتر\n';
    s += '• الموديل: ' + z.inv.model + '\n';
    s += '• القدرة: ' + z.inv.kwac + ' kW لكل انفرتر الإجمالي ' + (z.inv.kwac * z.nInv).toFixed(1) + ' kW\n';
    s += '• أقصى دخل PV: ' + (z.inv.pvmax * z.nInv).toFixed(1) + ' kWp | عدد المنظمات MPPT: ' + z.mppt + '\n\n';
    s += 'ثالثاً: الألواح\n';
    s += '• العدد الكلي: ' + z.nPan + ' لوح\n';
    s += '• الموديل: ' + z.pan.model + ' — ' + z.pan.wp + ' وات\n';
    s += '• إجمالي القدرة: ' + z.kWp.toFixed(2) + ' kWp\n\n';
    s += 'رابعاً: السلاسل (Strings)*\n';
    s += '• التوزيع: ' + z.nStr + ' × ' + z.perStr + ' = ' + z.nPan + ' لوح\n';
    s += '• فولتية السلسلة Voc: ' + z.strVoc.toFixed(1) + ' V | Vmp: ' + z.strVmp.toFixed(1) + ' V\n\n';
    s += 'خامساً: البطاريات\n';
    if (z.nBat > 0) {
      s += '• العدد: ' + z.nBat + ' بطارية\n';
      s += '• الموديل: ' + z.bat.model + ' — ' + z.bat.kwh + ' kWh\n';
      s += '• السعة الكلية: ' + z.batKwh.toFixed(2) + ' kWh\n';
    } else {
      s += '• لا توجد بطاريات (منظومة On-Grid)\n';
    }
    return s;
  }
  function pvSldParams(z, cty, ref) {
    return {
      panel: { model: pvAsc(z.pan.model), wp: z.pan.wp, voc: z.pan.voc, vmp: z.pan.vmp, imp: z.pan.imp, isc: z.pan.isc },
      inv: { model: pvAsc(z.inv.model), kwac: z.inv.kwac, vmin: z.inv.vmin, vmax: z.inv.vmax, vbat: z.inv.vbat, vbatRange: z.inv.vbatRange || '' },
      bat: { model: z.nBat > 0 ? pvAsc(z.bat.model) : '', kwh: z.nBat > 0 ? z.bat.kwh : 0 },
      batKey: z.nBat > 0 ? (z.batKey || '') : '',
      nStr: z.nStr, perStr: z.perStr, nPan: z.nPan, nInv: z.nInv, nBat: z.nBat,
      kWp: z.kWp, phase3: z.inv.ph === 3, mppt: z.mppt, mpptPerInv: z.mpptPerInv, strPerMppt: z.strPerMppt, strPerInv: z.strPerInv,
      strVoc: z.strVoc, strVmp: z.strVmp, peak: z.peak, daily: z.daily,
      sysLabel: pvSysLabelEn(z.sysMode), sysMode: z.sysMode, city_en: pvCityEn(cty),
      // Same quotation build data used by the later formal quote.
      quote_items: stripBaseItems(pvQuoteItems(z)),
      quote_source: 'QUOTE_BUILD_DATASET',
      date: new Date().toISOString().slice(0, 10),
      ref: ref || '', project: 'ACTES SOLAR PV SYSTEM',
      designer: 'SUFYAN JAMIL', send_dxf: false,
      filename: 'ACTES-SLD-' + String(Date.now()).slice(-6)
    };
  }
  function pvStudyParams(z, cty, loads, qnum) {
    var _io = pvLoad();
    var _src = _io && _io.load_source ? String(_io.load_source) : 'UNKNOWN';
    var _rawPct = _io && Array.isArray(_io.load_pct) ? _io.load_pct : null;
    var _normPct = _io && Array.isArray(_io.load_pct_norm) ? _io.load_pct_norm : null;
    return {
      kind: 'custom',
      gen: z.gen || null,
      ind: (_io && _io.ind) ? { name: _io.ind.name, act: _io.ind.act, shifts: _io.ind.shifts, tot: _io.ind.tot } : null,
      customer_name: customer_name || 'عميل أكتس',
      city: cty || 'صنعاء',
      quote_number: qnum,
      peak_load: z.peak,
      monthly_consumption: Math.round(z.daily * 30),
      night_hours: '',
      phase_type: z.inv.ph === 3 ? '3' : '1',
      sys_mode: z.sysMode,
      hourly_loads: loads,
      load_source: _src,
      load_monthly_kwh: isFinite(Number(z.daily)) ? Number(z.daily) * 30 : 0,
      load_daily_kwh: Number(z.daily) || 0,
      load_hourly_pct_raw: _rawPct,
      load_hourly_pct_normalized: _normPct,
      load_hourly_pct_sum_raw: _rawPct ? _rawPct.reduce(function(a,b){return a+b;},0) : null,
      strings: { n: z.nStr, s: z.perStr },
      cfg: {
        name: z.kWp.toFixed(1) + ' kWp ' + pvSysLabelEn(z.sysMode) + ' System',
        quote: qnum || '',
        panel: z.panKey, nPan: z.nPan,
        inv: z.inv.key, nInv: z.nInv,
        bat: z.batKey, nBat: z.nBat,
        load: z.daily, dayPct: z.dayPct,
        phase3: z.inv.ph === 3
      },
      // IMPORTANT: this is the exact normalized item set later used by pvIssueQuote().
      // It is carried with the study so SLD/PVsyst can consume the same quotation build dataset.
      quote_items: stripBaseItems(pvQuoteItems(z)),
      engineering_items: stripBaseItems(pvQuoteItems(z)),
      engineering_source: 'EXACT_RECOMMENDED_CUSTOM_SYSTEM',
      quote_source: 'QUOTE_BUILD_DATASET',
      quote_status: qnum ? 'issued-or-existing' : 'pending-quote'
    };
  }
  // حالة الدراسة محفوظة في حقل main_loads بصيغة JSON
  function pvLoad() {
    try { var o = JSON.parse(String(main_loads || '')); if (o && o.l && o.l.length === 24) { return o; } } catch (e) { }
    return null;
  }
  function pvSave(o) { main_loads = JSON.stringify(o); }
  function pvDesign() {
    var o = pvLoad();
    if (!o || !o.m) { return null; }
    var zz = sizeSystem(o.l, o.m);
    if (o.ind) { zz = indAdjust(zz, o.ind); }
    return zz;
  }

  // ===================== المسار الصناعي (v5.95) =====================
  // حالة المسار الصناعي محفوظة داخل main_loads بصيغة JSON: { l:[24], c:'', m:'', ind:{...} }
  var IND_ACTS = { '1': 'صناعات غذائية', '2': 'بلاستيك وتعبئة', '3': 'معادن وورش', '4': 'نسيج وملابس', '5': 'مواد بناء وخرسانة', '6': 'تبريد وتجميد', '7': 'أخرى' };
  var IND_SRC = { '1': 'مولد فقط', '2': 'شبكة + مولد', '3': 'شبكة فقط', '4': 'يوجد نظام شمسي' };
  var IND_GOAL = { '1': 'تقليل تشغيل المولد والديزل', '2': 'نظام كامل 24 ساعة (هجين + بطاريات + ATS)', '3': 'ربط بالشبكة فقط (On-Grid)' };
  var IND_MAX_INV = 10; // أكبر عدد انفرترات قبل التحويل للموظف
  var IND_ATS_SIZES = [63, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600];
  function indDigits(t) { return String(t || '').replace(/[٠-٩]/g, function (dd) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(dd)); }).replace(/[۰-۹]/g, function (dd) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(dd)); }); }
  function indNum(t) { var v = parseFloat(indDigits(t).replace(/,/g, '').replace(/[^\d.]/g, ' ').trim().split(/\s+/)[0]); return isNaN(v) ? NaN : v; }
  function indLoad() {
    var o = pvLoad();
    if (o && o.ind) { return o; }
    return null;
  }
  function indGet() { var o = indLoad(); return o ? o.ind : null; }
  function indInit(name) {
    var l = []; for (var i = 0; i < 24; i++) { l.push(0); }
    pvSave({ l: l, c: '', m: '', ind: { name: name, shifts: [], nsh: 0, cur: 0 } });
  }
  function indSet(patch) {
    var o = indLoad(); if (!o) { return; }
    var k = Object.keys(patch);
    for (var i = 0; i < k.length; i++) { o.ind[k[i]] = patch[k[i]]; }
    pvSave(o);
  }
  function indHdr(t) { return W(' المسار الصناعي — ' + t + '\n' + SEP + '\n'); }
  function indNameAsk() { return indHdr('بيانات المشروع') + 'ما اسم المشروع / المصنع؟'; }
  function indLocAsk() { return locGovAsk(' المسار الصناعي موقع المشروع\nيرجى تحديد موقع المشروع من القوائم التالية._'); }
  function indActivityAsk() { return indHdr('نوع النشاط') + 'ما نوع النشاط الصناعي؟\nاختر من القائمة بالأسفل أو اكتب نوع النشاط نصاً._'; }
  function indShiftsAsk() { return indHdr('ساعات التشغيل') + 'كم وردية يعمل المصنع في اليوم؟\n\n1 — وردية واحدة\n2 — ورديتان\n3 — ثلاث ورديات'; }
  function indShiftAsk(n) {
    var ex = n === 1 ? '08:00 - 16:00' : (n === 2 ? '16:00 - 00:00' : '00:00 - 08:00');
    return indHdr('الوردية ' + ['الأولى', 'الثانية', 'الثالثة'][n - 1]) + 'اكتب وقت بداية ونهاية الوردية\nمثال: ' + ex + '_';
  }
  function indParseShift(t) {
    var s = indDigits(t).replace(/[–—ـ]/g, '-');
    var m2 = s.match(/(\d{1,2})(?:[:.](\d{2}))?\s(?:-|الى|إلى|to|→|حتى|ل)\s(\d{1,2})(?:[:.](\d{2}))?/);
    if (!m2) { return null; }
    var a = parseInt(m2[1], 10), b = parseInt(m2[3], 10);
    if (m2[2] && parseInt(m2[2], 10) >= 30) { a += 1; }
    if (m2[4] && parseInt(m2[4], 10) >= 30) { b += 1; }
    if (a > 24 || b > 24) { return null; }
    a = a % 24; b = b % 24;
    if (a === b) { return null; }
    return [a, b];
  }
  function indShiftHours(sh) { return sh[1] > sh[0] ? sh[1] - sh[0] : (24 - sh[0] + sh[1]); }
  function indHH(h) { return (h < 10 ? '0' : '') + h + ':00'; }
  function indShiftMap(shifts) {
    var on = []; for (var h = 0; h < 24; h++) { on.push(false); }
    for (var i = 0; i < shifts.length; i++) {
      var a = shifts[i][0], n = indShiftHours(shifts[i]);
      for (var k = 0; k < n; k++) { on[(a + k) % 24] = true; }
    }
    return on;
  }
  function indHoursSummary(ind) {
    var on = indShiftMap(ind.shifts), tot = 0, day = 0;
    for (var h = 0; h < 24; h++) { if (on[h]) { tot++; if (h >= 6 && h < 18) { day++; } } }
    return { total: tot, day: day, night: tot - day };
  }
  function indShiftsText(ind) {
    var s = '';
    for (var i = 0; i < ind.shifts.length; i++) { s += '• الوردية ' + (i + 1) + ': ' + indHH(ind.shifts[i][0]) + ' → ' + indHH(ind.shifts[i][1]) + ' (' + indShiftHours(ind.shifts[i]) + ' ساعة)\n'; }
    var hs = indHoursSummary(ind);
    s += '\nإجمالي ساعات التشغيل:* ' + hs.total + ' ساعة/يوم\nنهاراً (06–18): ' + hs.day + ' ساعة\nليلاً: ' + hs.night + ' ساعة';
    return s;
  }
  function indLoadSrcAsk() { return indHdr('الأحمال') + 'كيف تزودنا بأحمال المصنع؟\n\n1 — جدول أحمال Excel / PDF\n2 — صورة لوحات البيانات\n3 — إدخال القيم يدوياً'; }
  function indLoadFileAsk() { return indHdr('الأحمال') + 'أرسل الملف أو الصورة الآن، وسيراجعها المهندس المختص._\nبعد الإرسال سنطلب منك القيم الأساسية لإتمام التصميم الأولي._\n\nأو اضغط تخطي للإدخال اليدوي مباشرة._'; }
  function indTotalAsk() { return indHdr('الأحمال') + 'ما إجمالي الحمل التشغيلي أثناء العمل بالكيلو وات (kW)؟\n_(مجموع الماكينات والإنارة والتكييف التي تعمل معاً)_\nمثال: 120_'; }
  function indMaxAsk() { return indHdr('الأحمال') + 'ما أكبر حمل أو ماكينة منفردة بالكيلو وات (kW)؟\nمثال: 30_'; }
  function indMotorsAsk() { return indHdr('الأحمال') + 'هل توجد محركات ذات تيار إقلاع عالٍ (ضواغط، مضخات كبيرة، كسارات، مصاعد)؟'; }
  function indMotorKwAsk() { return indHdr('الأحمال') + 'ما قدرة أكبر محرك ذي تيار إقلاع عالٍ بالكيلو وات (kW)؟\nمثال: 22_'; }
  function indSourceAsk() { return indHdr('مصدر الكهرباء الحالي') + 'ما مصدر الكهرباء الحالي للمصنع؟\n\n1 — مولد فقط\n2 — شبكة + مولد\n3 — شبكة فقط\n4 — يوجد نظام شمسي حالياً'; }
  function indGenAsk() { return indHdr('المولد') + 'ما قدرة المولد الحالي بالـ kVA؟\nمثال: 250_\n_(أو اضغط لا أعرف)_'; }
  function indDieselAsk() { return indHdr('استهلاك الديزل') + 'كم يستهلك المولد من الديزل تقريباً باللتر في اليوم؟\nمثال: 300_\n_(أو اضغط لا أعرف)_'; }
  function indOldPvAsk() { return indHdr('النظام الشمسي الحالي') + 'ما قدرة النظام الشمسي الحالي بالكيلو وات (kWp)؟\nمثال: 50_'; }
  function indGoalAsk() { return indHdr('المطلوب من النظام') + 'ما الهدف من المنظومة؟\n\n1 — تقليل تشغيل المولد والديزل (تغطية النهار + بطاريات محدودة)\n2 — نظام كامل 24 ساعة (هجين + بطاريات + مولد احتياطي ATS)\n3 — ربط بالشبكة فقط (On-Grid بدون بطاريات)'; }
  function indBuildProfile(ind) {
    var on = indShiftMap(ind.shifts), l = [];
    var op = parseFloat(ind.tot) || 0;
    var standby = Math.max(0.5, Math.round(op * 0.05 * 100) / 100);
    // هدف "تقليل الديزل": تُحجَّم المنظومة على الورديات النهارية فقط (المولد يغطي الليل)
    var dayOnly = String(ind.goal) === '1';
    for (var h = 0; h < 24; h++) { var night = (h < 6 || h >= 18); l.push((on[h] && !(dayOnly && night)) ? op : standby); }
    return l;
  }
  function indMode(goal) { return goal === '3' ? 'on' : 'hyb'; }
  function indAtsAmps(kva) {
    var a = kva * 1000 / (1.732 * 400) * 1.25;
    for (var i = 0; i < IND_ATS_SIZES.length; i++) { if (IND_ATS_SIZES[i] >= a) { return IND_ATS_SIZES[i]; } }
    return IND_ATS_SIZES[IND_ATS_SIZES.length - 1];
  }
  // تعديل نتيجة sizeSystem بحسب معطيات المصنع (تيار الإقلاع، الهدف، المولد)
  function indAdjust(z, ind) {
    var op = parseFloat(ind.tot) || z.peak;
    var motor = parseFloat(ind.motorkw) || 0;
    var startKw = motor > 0 ? (op - motor + motor * 3) : op * 1.25;
    var needAc = Math.max(z.peak * 1.25, startKw);
    var nInv = z.nInv;
    if (z.inv.kwac * nInv < needAc) { nInv = Math.ceil(needAc / z.inv.kwac); }
    if (nInv !== z.nInv) {
      var spi = [], bs = Math.floor(z.nStr / nInv), rm = z.nStr % nInv;
      for (var q = 0; q < nInv; q++) { spi.push(bs + (q < rm ? 1 : 0)); }
      z.nInv = nInv; z.strPerInv = spi; z.mppt = z.inv.mppt * nInv;
    }
    if (ind.goal === '1' && z.nBat > 0) {
      // بطاريات محدودة: احتياطي ساعة واحدة من الحمل التشغيلي لتغطية السحب والانتقال للمولد
      var use = z.bat.kwh * z.bat.dod / 100;
      var nb = Math.max(1, Math.ceil(op * 1.0 / use));
      if (nb < z.nBat) { z.nBat = nb; z.batKwh = z.bat.kwh * nb; z.needKwh = op; }
    }
    z.ind = { needAc: needAc, startKw: startKw, motor: motor };
    var hasGen = ind.src === '1' || ind.src === '2' || ind.goal === '2';
    if (hasGen) {
      var gk = parseFloat(ind.genkva) || 0;
      var rec = Math.ceil(needAc / 0.8 * 1.1 / 10) * 10;
      z.gen = { kva: gk > 0 ? gk : rec, rec: rec, existing: gk > 0, ats: indAtsAmps(gk > 0 ? gk : rec) + 'A / 4P' };
    }
    var dz = parseFloat(ind.diesel) || 0;
    if (dz > 0) {
      var hsx = indHoursSummary(ind);
      var frac = ind.goal === '2' ? 0.9 : (hsx.total > 0 ? hsx.day / hsx.total : 0);
      z.diesel = { day: dz, savedDay: Math.round(dz * frac), savedMonth: Math.round(dz * frac * 30), pct: Math.round(frac * 100) };
    }
    return z;
  }
  function indSizing() {
    var o = indLoad(); if (!o) { return null; }
    o.l = indBuildProfile(o.ind);
    o.m = indMode(o.ind.goal);
    pvSave(o);
    return pvDesign();
  }
  function indSummaryText(z, ind) {
    var hs = indHoursSummary(ind);
    var s = ' المنظومة الصناعية المقترحة\n' + SEP + '\n';
    s += ' المشروع: *' + (ind.name || '-') + '\n';
    if (ind.c) { s += ' الموقع: ' + ind.c + '\n'; }
    s += ' النشاط: ' + (ind.act || '-') + '\n';
    s += ' الهدف: ' + (IND_GOAL[ind.goal] || '-') + '\n\n';
    s += 'أولاً: التشغيل والأحمال\n';
    s += '• الورديات: ' + ind.shifts.length + ' — ' + hs.total + ' ساعة/يوم (نهار ' + hs.day + ' | ليل ' + hs.night + ')\n';
    s += '• الحمل التشغيلي: ' + (parseFloat(ind.tot) || 0) + ' kW | أكبر ماكينة: ' + (parseFloat(ind.maxm) || 0) + ' kW\n';
    if (z.ind && z.ind.motor > 0) { s += '• تيار إقلاع: محرك ' + z.ind.motor + ' kW × 3 → قدرة مطلوبة ' + z.ind.needAc.toFixed(1) + ' kW\n'; }
    s += '• الاستهلاك اليومي المصمم عليه: ' + z.daily.toFixed(1) + ' kWh (نهار ' + z.dayPct + '%)' + (ind.goal === '1' && hs.night > 0 ? ' — الورديات الليلية يغطيها المولد' : '') + '\n\n';
    s += 'ثانياً: الألواح (PV)*\n' + z.nPan + ' × ' + z.pan.wp + ' وات = *' + z.kWp.toFixed(2) + ' kWp*\n' + z.pan.model + '\n\n';
    s += 'ثالثاً: الانفرترات\n' + z.nInv + ' × ' + z.inv.model + '\nالإجمالي: ' + (z.inv.kwac * z.nInv).toFixed(1) + ' kW — ' + (z.inv.ph === 3 ? 'ثلاثي الفاز' : 'أحادي الفاز') + '\n\n';
    s += 'رابعاً: البطاريات\n';
    if (z.nBat > 0) { s += '• ' + z.nBat + ' × ' + z.bat.model + ' = ' + z.batKwh.toFixed(1) + ' kWh\n'; }
    else { s += '• بدون بطاريات (On-Grid)\n'; }
    s += '\nخامساً: المولد / ATS*\n';
    if (z.gen) {
      s += '• المولد: ' + z.gen.kva + ' kVA' + (z.gen.existing ? ' (الحالي)' : ' (موصى به)') + '\n';
      if (z.gen.existing && z.gen.kva < z.gen.rec) { s += '  ⚠️ المولد الحالي أصغر من الموصى به (' + z.gen.rec + ' kVA) لتغطية تيار الإقلاع\n'; }
      s += '• لوحة تحويل آلي ATS: ' + z.gen.ats + ' مع لوحة توزيع AC\n';
    } else { s += '• لا يلزم مولد في هذا الخيار\n'; }
    if (z.diesel) {
      s += '\nسادساً: التوفير التقديري في الديزل\n' + z.diesel.savedDay + ' لتر/يوم ≈ *' + z.diesel.savedMonth + ' لتر/شهر (تغطية ' + z.diesel.pct + '%)\n';
    }
    s += SEP + '\nالمنظومة أعلاه تصميم أولي يتم اعتماد النهائي بعد مراجعة جدول الأحمال._\n\nاختر الخطوة التالية من الأزرار:_';
    return W(s);
  }
  function indResultAsk() { return W(' الخطوة التالية\n' + SEP + '\nاختر: عرض السعر • دراسة PVsyst • مخطط SLD_'); }
  function notifInd(z, ind, tag) {
    var hs = indHoursSummary(ind);
    var s = AC + ' — ' + (tag || 'طلب منظومة صناعية') + (quote_number ? ' ' + quote_number : '') + '\n' + SEP + '\n';
    s += 'المشروع: ' + (ind.name || '-') + '\nالموقع: ' + (ind.c || city || '-') + '\nالنشاط: ' + (ind.act || '-') + '\n';
    s += 'الورديات: ' + ind.shifts.length + ' (' + hs.total + ' س/يوم نهار ' + hs.day + ' / ليل ' + hs.night + ')\n';
    for (var i = 0; i < ind.shifts.length; i++) { s += '  - ' + indHH(ind.shifts[i][0]) + ' → ' + indHH(ind.shifts[i][1]) + '\n'; }
    s += 'الحمل التشغيلي: ' + (ind.tot || '-') + ' kW | أكبر ماكينة: ' + (ind.maxm || '-') + ' kW | محرك إقلاع عالٍ: ' + (ind.motorkw ? ind.motorkw + ' kW' : 'لا') + '\n';
    s += 'ملف/صورة أحمال: ' + (ind.file ? 'نعم (مرفق في المحادثة)' : 'لا') + '\n';
    s += 'المصدر الحالي: ' + (IND_SRC[ind.src] || '-') + (ind.genkva ? ' — مولد ' + ind.genkva + ' kVA' : '') + (ind.diesel ? ' — ديزل ' + ind.diesel + ' لتر/يوم' : '') + (ind.pvold ? ' — PV حالي ' + ind.pvold + ' kWp' : '') + '\n';
    s += 'الهدف: ' + (IND_GOAL[ind.goal] || '-') + '\n' + SEP + '\n';
    if (z) {
      s += 'المقترح: ' + z.kWp.toFixed(1) + ' kWp | ' + z.nInv + '× ' + z.inv.model + ' | بطاريات ' + z.nBat + '× ' + (z.nBat > 0 ? z.bat.model : '-') + '\n';
      if (z.gen) { s += 'مولد: ' + z.gen.kva + ' kVA | ATS ' + z.gen.ats + '\n'; }
      if (z.diesel) { s += 'توفير ديزل: ' + z.diesel.savedMonth + ' لتر/شهر\n'; }
    }
    s += 'الهاتف: ' + phone + '\nالوقت: ' + now.replace('T', ' ').substring(0, 16) + ' UTC';
    return s;
  }
  function indOutOfRange(ind) {
    notify_employee = true;
    notification_text = notifInd(null, ind, 'منظومة صناعية كبيرة تحتاج تصميم هندسي');
    step = 'done';
    return W(' منظومتك تحتاج تصميماً هندسياً خاصاً\n' + SEP + '\nحجم الأحمال يتجاوز المنظومات القياسية لدينا._\nتم تحويل بيانات مشروعك للمهندس المختص وسيتواصل معك قريباً._\n ' + EMP_PHONE + '\n\nأرسل 0 للعودة إلى البداية._');
  }

  function pvFindItem(key) {
    for (var ci = 0; ci < CAT_ORDER.length; ci++) {
      var its = ITEM_CATS[CAT_ORDER[ci]].items;
      for (var ii = 0; ii < its.length; ii++) { if (its[ii][0] === key) { return its[ii]; } }
    }
    return null;
  }
  function pvPush(list, key, qty) {
    var e = pvFindItem(key);
    if (!e || !(qty > 0)) { return; }
    var pr = itemPrice(e[0], e[3]);
    list.push({ key: e[0], name: e[1], unit: e[2], qty: qty, price: pr, total: qty * pr });
  }
  function pvQuoteItems(z) {
    var list = [];
    pvPush(list, 'panel:' + z.pan.wp, z.nPan);
    pvPush(list, z.inv.item || ('inverter:' + z.inv.kwac + ':' + z.inv.ph), z.nInv);
    if (z.nBat > 0) { pvPush(list, z.bat.item || ('battery:' + z.bat.kwh), z.nBat); }
    pvPush(list, 'cable', z.nPan * 4 + 30);
    pvPush(list, 'dc:' + Math.min(4, Math.max(1, z.nStr)), 1);
    pvPush(list, z.inv.ph === 3 ? ((z.inv.kwac * z.nInv >= 30) ? 'ac:3-100' : 'ac:3') : 'ac:1', 1);
    return list;
  }
  function pvSldAskMsg() {
    return W(' تمت دراسة منظومتك بنجاح\n' + SEP +
      '\nهل ترغب بإنشاء مخطط SLD لمنظومتك؟');
  }
  function pvQuoteAskMsg() {
    return W(' عرض سعر رسمي لمنظومتك المدروسة\n' + SEP +
      '\nهل ترغب بأن نُصدر لك عرض سعر رسمي معتمد بمكونات المنظومة التي تمت دراستها؟\n\nيشمل العرض: الألواح • الانفرتر • البطاريات • الكابلات ولوحات الحماية، مع الكميات والأسعار وشروط التوريد._');
  }
  function pvQuoteSummary(z, list) {
    var t = '', i, g = 0;
    for (i = 0; i < list.length; i++) {
      t += '' + (i + 1) + '* - ' + list[i].name + '\n_' + list[i].qty + ' ' + list[i].unit + ' × ' + money2(list[i].price) + ' = ' + money2(list[i].total) + ' ' + CUR_LBL + '_\n';
      g += list[i].total;
    }
    return { text: t, total: g };
  }
  function pvIssueQuote() {
    var z = pvDesign();
    if (!z) { return false; }
    var o = pvLoad();
    var list = pvQuoteItems(z);
    var sm2 = pvQuoteSummary(z, list);
    var qnum = (quote_number && String(quote_number).indexOf('ACTES-IND') === 0) ? quote_number : ('ACTES-Q' + String(Date.now()).slice(-6));
    quote_items = stripBaseItems(list);
    quote_number = qnum;
    item_quote = true;
    send_quote_file = true;
    notify_employee = true;
    var tsi = now.replace('T', ' ').substring(0, 16) + ' UTC';
    notification_text = AC + ' — عرض سعر منظومة مدروسة (PVsyst) رقم ' + qnum + '\n' + SEP + '\n' +
      'العميل: ' + (customer_name || '-') + '\nالموقع: ' + (o && o.c ? o.c : city || '-') + '\n' +
      'المنظومة: ' + z.kWp.toFixed(2) + ' kWp — ' + pvSysLabel(z.sysMode) + '\n' + SEP + '\n' +
      sm2.text + SEP + '\n' + fxLines(sm2.total) + '\nالهاتف: ' + phone + '\nالوقت: ' + tsi;
    response = W(' تم اعتماد طلبك لإصدار عرض السعر الرسمي\n' + SEP +
      '\nالسادة / ' + (customer_name || '-') + ' المحترمين\n' +
      'رقم العرض: *' + qnum + '\n' +
      'موقع المشروع: ' + (o && o.c ? o.c : city || '-') + '\n' +
      'المنظومة المدروسة: *' + z.kWp.toFixed(2) + ' kWp* — ' + pvSysLabel(z.sysMode) + '\n' + (z.gen ? 'المولد / ATS: ' + z.gen.kva + ' kVA — ATS ' + z.gen.ats + ' _(يُسعَّر بعد المعاينة)_\n' : '') + SEP + '\n' +
      sm2.text + SEP + '\n' + fxLines(sm2.total).split('\n').join('\n') + '\n' + SEP +
      '\nجارٍ إصدار عرض السعر الرسمي بصيغة PDF وإرساله إليكم خلال لحظات._\n\nمع خالص التقدير،\n_' + AC.replace(/\*/g, '').trim() + ' — قسم الطاقة الشمسية\n\nأرسل 0 للعودة إلى البداية._');
    return true;
  }


  // ===================== الحسابات والإشعارات والمبيعات =====================
  var __quote_total = 0;
  var FIN_PHONE = '773903901';
  var SALES_PHONE = '773590979';
  var SALES_PHONE_2 = '770229994';
  let extra_payloads = [];
  function waNum(num) { var v = String(num).replace(/[^0-9]/g, '').replace(/^0+/, ''); if (v.indexOf('967') !== 0) { v = '967' + v; } return v; }
  function waTo(num, body) {
    return { messaging_product: 'whatsapp', recipient_type: 'individual', to: waNum(num), type: 'text', text: { preview_url: true, body: body } };
  }
  function payAccountsMsg() {
    var __w = payWayText();
    var __h = /محفظة|محافظ/.test(__w) ? ' التحويل عبر المحافظ الإلكترونية' : (/شبكة|شبكات/.test(__w) ? ' التحويل عبر الشبكات المحلية' : ' بيانات الحساب للتحويل');
    return W(__h + '\n' + SEP +
      '\nالاسم:* أكتس لأستيراد أنظمة الطاقة\nرقم الجوال:* 773903901\n' + SEP +
      '\nحوّل المبلغ المستحق على الرقم أعلاه._\n' +
      'ثم أرسل إشعار التحويل هنا (صورة أو نص)._');
  }
  function noticeReceivedMsg() {
    return W(' تم استلام إشعار التحويل\n' + SEP +
      '\nشكراً لك، تم استلام إشعارك بنجاح._\n' +
      'عند تأكيد الفاتورة سيصلك إشعار، وسيتم التواصل معك من إدارة المبيعات._');
  }

  function lastQuote() {
    var raw = String(session.project_type || '');
    if (raw.indexOf('Q|') !== 0) { return { num: quote_number || '', url: quote_file_url || '', total: __quote_total || 0 }; }
    var p = raw.split('|');
    return { num: quote_number || p[1] || '', url: quote_file_url || p[2] || '', total: parseFloat(p[3] || 0) || __quote_total || 0 };
  }
  function forwardNoticeToFinance() {
    var lq = lastQuote();
    var cap = ' إشعار حوالة (' + (payWayText() || 'حوالة') + ') من العميل: ' + (customer_name || session.customer_name || '-') +
              '\n رقم العميل: ' + phone +
              '\n رقم الفاتورة: ' + (lq.num || '-') +
              (lq.total ? ('\n حساب الفاتورة: ' + money(lq.total) + ' دولار') : '');
    var mid = String(pd.media_id || '');
    var mtype = String(pd.media_type || '');
    if (mid && (mtype === 'image' || mtype === 'document' || mtype === 'video')) {
      var media = { id: mid, caption: cap };
      if (mtype === 'document') { media.filename = 'اشعار-حوالة-' + (lq.num || phone) + '.pdf'; }
      var pl = { messaging_product: 'whatsapp', recipient_type: 'individual', to: waNum(FIN_PHONE), type: mtype };
      pl[mtype] = media;
      extra_payloads.push(pl);
    } else {
      extra_payloads.push(waTo(FIN_PHONE, cap + '\n\nمحتوى الإشعار:_ ' + (String(text) === '__media__' ? 'مرفق غير مدعوم' : String(text || '-'))));
    }
  }
  function financeConfirmPayload() {
    var lq = lastQuote();
    var amt = lq.total ? (money(lq.total) + ' دولار') : 'غير محدد';
    var body = ' تأكيد إشعار حوالة\n' + SEP +
      '\nالطريقة:* ' + (payWayText() || '-') +
      '\nالعميل:* ' + (customer_name || session.customer_name || '-') +
      '\nرقم العميل:* ' + phone +
      '\nالموقع:* ' + (city || '-') +
      '\nرقم الفاتورة:* ' + (lq.num || '-') +
      '\nحساب الفاتورة:* ' + amt + '\n' + SEP +
      '\nهل وصلك إشعار الحوالة؟ اختر أحد الزرين بالأسفل._';
    var __payHdr = payHeaderImage();
    return {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: waNum(FIN_PHONE),
      type: 'interactive',
      interactive: {
        type: 'button',
        header: __payHdr ? { type: 'image', image: { link: __payHdr } } : undefined,
        body: { text: body },
        action: { buttons: [
          { type: 'reply', reply: { id: 'inv_ok_' + phone, title: 'تأكيد الفاتورة' } },
          { type: 'reply', reply: { id: 'inv_no_' + phone, title: 'لا' } }
        ] }
      }
    };
  }
  function handleInvoiceConfirm() {
    var t = String(text);
    var cust = t.replace(/^inv_(ok|no)_/, '');
    var ok = t.indexOf('inv_ok_') === 0;
    step = session.step || 'done';
    if (ok) {
      extra_payloads.push(waTo(cust, ' *' + BRAND_TXT + '\n' + SEP +
        '\nشكراً لك، لقد تم تأكيد فاتورتك._\nستتواصل معك إدارة المبيعات في شركة أكتس خلال لحظات._'));
      extra_payloads.push(waTo(SALES_PHONE, ' تأكيد وصول إشعار الحوالة\n' + SEP +
        '\nتم تأكيد الفاتورة للعميل: ' + (customer_name || session.customer_name || '-') +
        '\nرقم العميل: ' + cust +
        '\nالموقع: ' + (city || '-') +
        '\nطريقة الدفع: ' + (session.service_needed || service_needed || '-') +
        '\nالوقت: ' + now.replace('T', ' ').substring(0, 16) + ' UTC\n' + SEP +
        '\nيرجى متابعة العميل من قسم المبيعات._'));
      // إرسال إشعار تأكيد الفاتورة أيضاً إلى الرقم الثاني للمبيعات/المتابعة.
      extra_payloads.push(waTo(SALES_PHONE_2, ' تأكيد وصول إشعار الحوالة\n' + SEP +
        '\nتم تأكيد الفاتورة للعميل: ' + (customer_name || session.customer_name || '-') +
        '\nرقم العميل: ' + cust +
        '\nالموقع: ' + (city || '-') +
        '\nطريقة الدفع: ' + (session.service_needed || service_needed || '-') +
        '\nالوقت: ' + now.replace('T', ' ').substring(0, 16) + ' UTC\n' + SEP +
        '\nيرجى متابعة العميل من قسم المبيعات._'));
      response = W(' تم تأكيد الفاتورة وإبلاغ العميل ' + cust + '._');
    } else {
      extra_payloads.push(waTo(cust, ' *' + BRAND_TXT + '\n' + SEP +
        '\nلم يتم العثور على إشعار التحويل حتى الآن._\nيرجى التأكد من التحويل أو إعادة إرسال الإشعار._'));
      response = W(' تم إبلاغ العميل ' + cust + ' بعدم تأكيد الإشعار._');
    }
  }
  function salesLinkMsg() {
    return W(' التواصل مع المبيعات\n' + SEP +
      '\nاضغط على الرابط التالي لبدء المحادثة مباشرة مع قسم المبيعات:_\n' +
      'https://wa.me/967' + SALES_PHONE + '\n\nأرسل 0 للعودة إلى البداية._');
  }
  function salesHandoff(kind) {
    var lq = lastQuote();
    var body = ' طلب من العميل — ' + kind + '\n' + SEP +
      '\nالعميل: ' + (customer_name || session.customer_name || '-') +
      '\nرقم العميل: ' + phone +
      '\nالموقع: ' + (city || '-') +
      '\nرقم عرض السعر: ' + (lq.num || '-') +
      '\nالوقت: ' + now.replace('T', ' ').substring(0, 16) + ' UTC';
    extra_payloads.push(waTo(SALES_PHONE, body));
    if (lq.url) {
      extra_payloads.push({
        messaging_product: 'whatsapp', recipient_type: 'individual', to: waNum(SALES_PHONE),
        type: 'document',
        document: { link: lq.url, filename: 'عرض سعر ' + (lq.num || '') + '.pdf', caption: 'عرض سعر العميل ' + (customer_name || '-') + ' — ' + phone }
      });
    }
  }


  // ===================== العودة خطوة واحدة =====================
  var PREV_STEP = {
    quote_menu: 'welcome_services',
    energy_menu: 'welcome_services',
    main_menu: 'welcome_services',
    menu_sys3: 'quote_menu',
    menu_res_com: 'menu_sys3',
    menu_ind_agr: 'menu_sys3',
    res_bill: 'menu_sys3',
    res_value: 'res_bill',
    res_browse_inv: 'res_bill',
    res_browse: 'res_browse_inv',
    res_tie: 'res_bill',
    res_quote_ask: 'res_bill',
    qnext_ask: 'res_bill',
    agr_bill: 'menu_ind_agr',
    agr_quote_ask: 'agr_bill',
    com_method: 'menu_sys3',
    com_value: 'com_method',
    com_inv_ask: 'com_value',
    com_phase_ask: 'com_inv_ask',
    com_quote_name: 'com_visit_ask',
    com_visit_date: 'com_visit_ask',
    com_visit_facility: 'com_visit_date',
    com_visit_location: 'com_visit_facility',
    com_quote_ask: 'com_method',
    buy_ask: 'res_quote_ask',
    buy_location: 'buy_ask',
    pay_method: 'buy_location_dist',
    pay_notice: 'pay_method',
    pay_wallet: 'pay_method',
    pay_network: 'pay_method',
    pay_wallet_name: 'pay_wallet',
    pay_network_name: 'pay_network',
    plan_pick: 'qnext_ask',
    study_ask: 'plan_pick',
    sld_ask: 'study_ask',
    ind_name: 'menu_sys3',
    ind_loc: 'ind_name',
    ind_activity: 'ind_loc_dist',
    ind_shifts: 'ind_activity',
    ind_shift: 'ind_shifts',
    ind_load_src: 'ind_shift',
    ind_load_file: 'ind_load_src',
    ind_total_kw: 'ind_load_src',
    ind_max_mach: 'ind_total_kw',
    ind_motors: 'ind_max_mach',
    ind_motor_kw: 'ind_motors',
    ind_source: 'ind_motors',
    ind_gen_kva: 'ind_source',
    ind_diesel: 'ind_gen_kva',
    ind_old_pv: 'ind_source',
    ind_goal: 'ind_source',
    ind_result: 'ind_goal',
    ind_quote_ask: 'ind_result',
    pv_loads: 'energy_menu',
    pv_sysmode: 'pv_loads',
    pv_study_ask: 'pv_sysmode',
    pv_sld_ask: 'pv_study_ask',
    pv_quote_ask: 'pv_sld_ask',
    pv_quote_name: 'pv_quote_ask',
    pv_site: 'pv_study_ask',
    sup_name: 'welcome_services',
    sup_city: 'sup_name',
    sup_device: 'sup_city_dist',
    sup_problem: 'sup_device',
    con_name: 'welcome_services',
    con_project: 'con_name',
    con_service: 'con_project',
    item_menu: 'quote_menu',
    item_pick: 'item_menu',
    item_qty: 'item_pick',
    item_next: 'item_menu',
    item_cart: 'item_menu',
    item_name: 'item_next'
  };
  function prevStepOf(st) {
    st = String(st || '');
    if (st === 'qnext_ask') {
      if (menu_choice === '2') { return 'com_value'; }
      if (menu_choice === '4') { return 'agr_bill'; }
      return 'res_value';
    }
    if (st === 'com_visit_ask') { return (parseFloat(pump_capacity) >= 20) ? 'com_inv_ask' : 'com_phase_ask'; }
    if (st === 'quote_name') { return menu_choice === '2' ? 'com_visit_ask' : 'res_quote_ask'; }
    if (/_dist$/.test(st)) { return st.slice(0, -5) + '_gov'; }
    if (/_gov$/.test(st)) { return PREV_STEP[st.slice(0, -4)] || 'welcome_services'; }
    return PREV_STEP[st] || 'welcome_services';
  }
  function askForStep(st) {
    st = String(st || '');
    // مسارات إضافية: صناعي / دراسة / دعم / أصناف / شراء ودفع
    if (st === 'res_browse_inv') { return resBrowseInvMsg(); }
    if (st === 'res_browse') { return resBrowseMsg(); }
    if (st === 'res_tie') { return resTieAsk(resTieList(), resDailyNeed(monthly_consumption) || 0); }
    if (st === 'agr_bill') { return billAsk('4'); }
    if (st === 'ind_name') { return indNameAsk(); }
    if (st === 'ind_activity') { return indActivityAsk(); }
    if (st === 'ind_shifts') { return indShiftsAsk(); }
    if (st === 'ind_shift') { var _si = indGet(); return indShiftAsk((_si && _si.cur) || 1); }
    if (st === 'ind_load_src') { return indLoadSrcAsk(); }
    if (st === 'ind_load_file') { return indLoadFileAsk(); }
    if (st === 'ind_total_kw') { return indTotalAsk(); }
    if (st === 'ind_max_mach') { return indMaxAsk(); }
    if (st === 'ind_motors') { return indMotorsAsk(); }
    if (st === 'ind_motor_kw') { return indMotorKwAsk(); }
    if (st === 'ind_source') { return indSourceAsk(); }
    if (st === 'ind_gen_kva') { return indGenAsk(); }
    if (st === 'ind_diesel') { return indDieselAsk(); }
    if (st === 'ind_old_pv') { return indOldPvAsk(); }
    if (st === 'ind_goal') { return indGoalAsk(); }
    if (st === 'ind_result') { return indResultAsk(); }
    if (st === 'ind_quote_ask') { return m('quote_ask'); }
    if (st === 'agr_quote_ask') { return m('quote_next'); }
    if (st === 'qnext_ask') { return m('quote_next'); }
    if (st === 'pv_loads') { return loadsTableMsg(); }
    if (st === 'pv_sysmode') { return W(' نوع النظام\n' + SEP + '\n1 — هجين (Hybrid)\n2 — مستقل (Off-Grid)\n3 — متصل بالشبكة (On-Grid)'); }
    if (st === 'pv_study_ask') { return W(' هل ترغب بدراسة PVsyst تفصيلية؟_'); }
    if (st === 'pv_sld_ask') { return pvSldAskMsg(); }
    if (st === 'pv_quote_ask') { return pvQuoteAskMsg(); }
    if (st === 'pv_quote_name') { return m('ask_name'); }
    if (st === 'sup_name') { return ' الدعم الفني وخدمات ما بعد البيع\n' + SEP + '\n يرجى إدخال اسم العميل:_'; }
    if (st === 'sup_device') { return SEP + '\n نوع الجهاز / النظام الذي فيه المشكلة :_'; }
    if (st === 'sup_problem') { return SEP + '\n وصف المشكلة:_\n_( يمكنك أيضاً إرسال صورة أو فيديو )_'; }
    if (st === 'con_name') { return W(' الاسم:_'); }
    if (st === 'con_project') { return W(' نوع المشروع:_'); }
    if (st === 'con_service') { return W(' الخدمة المطلوبة:_'); }
    if (st === 'item_menu') { return itemMenuMsg(); }
    if (st === 'item_pick') { return catAskMsg(load_type || 'pv'); }
    if (st === 'item_qty') { var _ci2 = catOf(load_type); var _u = 'حبة'; if (_ci2) { for (var _q2 = 0; _q2 < _ci2.items.length; _q2++) { if (_ci2.items[_q2][0] === device_type) { _u = _ci2.items[_q2][4]; } } } return askQty(_u); }
    if (st === 'item_next') { return itemNextMsg(''); }
    if (st === 'item_cart') { return cartMsg(''); }
    if (st === 'item_name') { return askItemName(); }
    if (st === 'plan_pick') { return planPickMsg(); }
    if (st === 'study_ask') { return studyAskMsg(); }
    if (st === 'sld_ask') { return sldAskMsg(); }
    if (st === 'pay_method') { return payMethodAsk(); }
    if (st === 'pay_wallet') { return payWalletAsk(); }
    if (st === 'pay_network') { return payNetworkAsk(); }
    if (st === 'pay_wallet_name' || st === 'pay_network_name') { return m('ask_name'); }
    if (st === 'welcome_services') { return goWelcome(); }
    if (st === 'energy_menu') { return energyWelcome(); }
    if (st === 'quote_menu') { return W(' طلب عرض سعر\n' + SEP + '\nاختر نوع طلبك\n\n1 — السكني والتجاري والصناعي\n2 — طلب صنف محدد\n' + SEP); }
    if (st === 'menu_sys3') { return W(' اختر نوع المنظومة\n' + SEP + '\n1 - السكني\n2 - التجاري\n3 - الصناعي (قريباً)'); }
    if (st === 'menu_res_com' || st === 'menu_ind_agr') { return W('اختر نوع النظام:'); }
    if (st === 'res_bill') { return resMethodAsk(); }
    if (st === 'res_value') { return resValueAsk(res_method || '1'); }
    if (st === 'com_value') { return comValueAsk(String(activity_type || 'com_1').replace('com_', '') || '1'); }
    if (st === 'res_browse_inv') {
      var crows = [];
      for (var ci = 0; ci < RES_INV_CLASSES.length; ci++) {
        var cl = resListOfClass(RES_INV_CLASSES[ci].kw);
        crows.push({ id: RES_INV_CLASSES[ci].id, title: 'انفرتر ' + RES_INV_CLASSES[ci].kw + ' كيلو', description: cl.length + ' منظومات جاهزة' });
      }
      return { kind: 'list', button: 'اختر القدرة', sections: [ { title: 'قدرة الانفرتر', rows: crows } ] };
    }
    if (st === 'res_browse_inv') {
      var invRows = [];
      for (var rii = 0; rii < RES_INV_CLASSES.length; rii++) {
        var rkw = RES_INV_CLASSES[rii].kw;
        var rlist = resListOfClass(rkw);
        invRows.push({
          id: 'resinv_' + rkw,
          title: 'منظومات انفرتر ' + rkw + ' كيلو',
          description: rlist.length + ' منظومات سكنية جاهزة'
        });
      }
      invRows.push({ id: 'back_step', title: 'العودة خطوة' });
      return { kind: 'list', button: 'اختر قدرة الانفرتر', sections: [
        { title: 'المنظومات السكنية', rows: invRows }
      ] };
    }
    if (st === 'res_browse') {
      var blist2 = resListOfClass(resInvSel()), brows = [];
      for (var bri = 0; bri < blist2.length; bri++) {
        brows.push({
          id: 'sys_' + blist2[bri].code,
          title: resOptionTitle(blist2[bri]),
          description: 'السعر: ' + money(resTotalOf(blist2[bri].code)) + ' $'
        });
      }
      return { kind: 'list', button: 'اختر المنظومة', sections: [ { title: 'المنظومات السكنية الجاهزة', rows: brows } ] };
    }
    if (st === 'res_tie') { return resTieAsk(resTieList(), resDailyNeed(monthly_consumption) || 0); }
    if (st === 'agr_bill') { return billAsk('4'); }
    if (st === 'ind_name') { return indNameAsk(); }
    if (st === 'ind_activity') { return indActivityAsk(); }
    if (st === 'ind_shifts') { return indShiftsAsk(); }
    if (st === 'ind_shift') { var _si = indGet(); return indShiftAsk((_si && _si.cur) || 1); }
    if (st === 'ind_load_src') { return indLoadSrcAsk(); }
    if (st === 'ind_load_file') { return indLoadFileAsk(); }
    if (st === 'ind_total_kw') { return indTotalAsk(); }
    if (st === 'ind_max_mach') { return indMaxAsk(); }
    if (st === 'ind_motors') { return indMotorsAsk(); }
    if (st === 'ind_motor_kw') { return indMotorKwAsk(); }
    if (st === 'ind_source') { return indSourceAsk(); }
    if (st === 'ind_gen_kva') { return indGenAsk(); }
    if (st === 'ind_diesel') { return indDieselAsk(); }
    if (st === 'ind_old_pv') { return indOldPvAsk(); }
    if (st === 'ind_goal') { return indGoalAsk(); }
    if (st === 'ind_result') { return indResultAsk(); }
    if (st === 'ind_quote_ask') { return m('quote_ask'); }
    if (st === 'agr_quote_ask') { return m('quote_next'); }
    if (st === 'qnext_ask') { return m('quote_next'); }
    if (st === 'pv_loads') { return loadsTableMsg(); }
    if (st === 'pv_sysmode') { return W(' نوع النظام\n' + SEP + '\n1 — هجين (Hybrid)\n2 — مستقل (Off-Grid)\n3 — متصل بالشبكة (On-Grid)'); }
    if (st === 'pv_study_ask') { return W(' هل ترغب بدراسة PVsyst تفصيلية؟_'); }
    if (st === 'pv_sld_ask') { return pvSldAskMsg(); }
    if (st === 'pv_quote_ask') { return pvQuoteAskMsg(); }
    if (st === 'pv_quote_name') { return m('ask_name'); }
    if (st === 'sup_name') { return ' الدعم الفني وخدمات ما بعد البيع\n' + SEP + '\n يرجى إدخال اسم العميل:_'; }
    if (st === 'sup_device') { return SEP + '\n نوع الجهاز / النظام الذي فيه المشكلة :_'; }
    if (st === 'sup_problem') { return SEP + '\n وصف المشكلة:_\n_( يمكنك أيضاً إرسال صورة أو فيديو )_'; }
    if (st === 'con_name') { return W(' الاسم:_'); }
    if (st === 'con_project') { return W(' نوع المشروع:_'); }
    if (st === 'con_service') { return W(' الخدمة المطلوبة:_'); }
    if (st === 'item_menu') { return itemMenuMsg(); }
    if (st === 'item_pick') { return catAskMsg(load_type || 'pv'); }
    if (st === 'item_qty') { var _ci2 = catOf(load_type); var _u = 'حبة'; if (_ci2) { for (var _q2 = 0; _q2 < _ci2.items.length; _q2++) { if (_ci2.items[_q2][0] === device_type) { _u = _ci2.items[_q2][4]; } } } return askQty(_u); }
    if (st === 'item_next') { return itemNextMsg(''); }
    if (st === 'item_cart') { return cartMsg(''); }
    if (st === 'item_name') { return askItemName(); }
    if (st === 'plan_pick') { return planPickMsg(); }
    if (st === 'study_ask') { return studyAskMsg(); }
    if (st === 'sld_ask') { return sldAskMsg(); }
    if (st === 'pay_method') { return payMethodAsk(); }
    if (st === 'pay_wallet') { return payWalletAsk(); }
    if (st === 'pay_network') { return payNetworkAsk(); }
    if (st === 'pay_wallet_name' || st === 'pay_network_name') { return m('ask_name'); }
    if (st === 'welcome_services') { return goWelcome(); }
    if (st === 'energy_menu') { return energyWelcome(); }
    if (st === 'quote_menu') { return W(' طلب عرض سعر\n' + SEP + '\nاختر نوع طلبك\n\n1 — السكني والتجاري والصناعي\n2 — طلب صنف محدد\n' + SEP); }
    if (st === 'menu_sys3') { return W(' اختر نوع المنظومة\n' + SEP + '\n1 - السكني\n2 - التجاري\n3 - الصناعي (قريباً)'); }
    if (st === 'menu_res_com' || st === 'menu_ind_agr') { return W('اختر نوع النظام:'); }
    if (st === 'res_bill') { return resMethodAsk(); }
    if (st === 'res_value') { return resValueAsk(res_method || '1'); }
    if (st === 'res_browse') { return W(' تصفح المنظومات السكنية\n' + SEP + '\nاختر منظومة من الأزرار بالأسفل:_'); }
    if (st === 'com_method') { return comMethodAsk(); }
    if (st === 'com_value') { return comValueAsk(String(activity_type).replace('com_', '') || '1'); }
    if (st === 'com_inv_ask') { return comInvAsk(); }
    if (st === 'com_phase_ask') { return comPhaseAsk(); }
    if (st === 'com_visit_ask') { return W(comVisitAsk()); }
    if (st === 'com_visit_date') { return comVisitDateAsk(); }
    if (st === 'com_visit_facility') { return comVisitFacilityAsk(); }
    if (st === 'com_quote_name' || st === 'quote_name') { return askNameMsg(); }
    if (st === 'res_quote_ask') { var _rq = RES_BY_CODE[system_type]; return _rq ? billResult({ code: _rq.code, name: _rq.name }, '1') : resMethodAsk(); }
    if (st === 'com_quote_ask') { return m('quote_next'); }
    if (st === 'qnext_ask') { return m('quote_next'); }
    if (st === 'buy_ask') { return buyAskMsg(); }
    if (st === 'buy_location_gov') { return buyLocationAsk(); }
    if (st === 'pay_method') { return payMethodAsk(); }
    if (st === 'pay_notice') { return payAccountsMsg(); }
    if (/_gov$/.test(st)) { return locGovAsk(' موقع المشروع'); }
    return null;
  }
  function goBackStep() {
    var p = prevStepOf(step);
    var msg = askForStep(p);
    if (!msg) { p = 'welcome_services'; msg = goWelcome(); }
    if (/_gov$/.test(p) || /_dist$/.test(p)) { city = ''; }
    step = p;
    response = msg;
  }

  var BRAND_TXT = 'أكتس لأنظمة الطاقة وحلولها';


  function __flatRows(ui) {
    var rows = [], a, b;
    if (!ui || ui.kind !== 'list' || !ui.sections) { return rows; }
    for (a = 0; a < ui.sections.length; a++) {
      for (b = 0; b < ui.sections[a].rows.length; b++) { rows.push(ui.sections[a].rows[b]); }
    }
    return rows;
  }
  function __numOptRows(st) {
    try {
      var ui = uiForStep(st);
      if (!ui || ui.kind !== 'list' || ui.locList) { return null; }
      var rows = __flatRows(ui);
      return rows.length ? rows : null;
    } catch (e) { return null; }
  }
  if (/^[1-9][0-9]?$/.test(String(text))) {
    var __rws = __numOptRows(step);
    if (__rws) {
      var __exact = false, __z;
      for (__z = 0; __z < __rws.length; __z++) { if (String(__rws[__z].id) === String(text)) { __exact = true; } }
      var __n = parseInt(text, 10);
      if (!__exact && __n >= 1 && __n <= __rws.length) { text = String(__rws[__n - 1].id); }
    }
  }

  if (customerNameSteps(step) && text === 'use_last_name' && String(session.customer_name || customer_name || '').trim()) {
    text = String(session.customer_name || customer_name).trim();
  }

  if ((step === 'res_value' || step === 'com_value') && text === 'use_last_consumption') {
    var __lastK = lastConsumptionKwh();
    var __methodIsKwh = (step === 'res_value' && String(res_method || '') === '2') || (step === 'com_value' && String(activity_type || '') === 'com_2');
    if (__lastK > 0 && __methodIsKwh) { text = String(__lastK); }
  }
  if (/^inv_(ok|no)_/.test(String(text))) {
    handleInvoiceConfirm();
  } else if (text === 'back_step' || text === 'العودة خطوة') {
    goBackStep();
  } else if (text === '0') {
    step='welcome_services'; lang=''; menu_choice=''; city=''; system_type=''; monthly_consumption='';
    peak_load=''; night_hours=''; activity_type=''; main_loads=''; load_type=''; pump_capacity=''; daily_hours='';
    device_type=''; problem_desc=''; project_type=(lastConsumptionKwh() > 0 ? ('LC=' + lastConsumptionKwh()) : ''); service_needed=''; wants_quote=''; phase_type=''; res_method='';
    response = goWelcome();
  } else if ((step === 'start' || !session.step) && /^resinv_[\d.]+$/.test(String(text))) {
    var _recoverRes = parseFloat(String(text).replace('resinv_', ''));
    if (resListOfClass(_recoverRes).length) {
      menu_choice = '1'; activity_type = 'resinv_' + _recoverRes; step = 'res_browse'; response = resBrowseMsg();
    } else { step = 'res_browse_inv'; response = noOpt(resBrowseInvMsg()); }
  } else if ((step === 'start' || !session.step) && /^invkw_[\d.]+$/.test(String(text)) && (parseFloat(peak_load) || parseFloat(monthly_consumption))) {
    menu_choice = '2';
    var _recoverKw = parseFloat(String(text).replace('invkw_', ''));
    var _recoverOpts = comInvOptions();
    var _recoverOk = false;
    for (var _rx = 0; _rx < _recoverOpts.length; _rx++) { if (_recoverOpts[_rx].kw === _recoverKw) { _recoverOk = true; break; } }
    if (_recoverOk) {
      pump_capacity = String(_recoverKw);
      if (_recoverKw >= 20) { phase_type = 'three'; comApplyResult(); }
      else if (_recoverKw === 8) { phase_type = 'single'; comApplyResult(); }
      else { step = 'com_phase_ask'; response = comPhaseAsk(); }
    } else { step = 'com_inv_ask'; response = noOpt(comInvAsk()); }
  } else if (step === 'start' || !session.step) {
    step = 'welcome_services';
    response = goWelcome();
  } else if (step === 'welcome_services') {
    if (text === 'quote_start') {
      step = 'menu_sys3';
      response = W(' اختر نوع المنظومة\n' + SEP + '\n1 - السكني\n2 - التجاري\n3 - الصناعي (قريباً)');
    } else if (text === 'renewable_solutions') {
      lang = 'ar';
      menu_choice = '7'; main_loads = ''; city = ''; pvSave({ l: [], c: '', m: '' });
      step = 'energy_menu';
      response = energyWelcome();
    } else if (text === 'aftersales_support') {
      lang = 'ar';
      menu_choice = '5';
      step = 'sup_name';
      response = ' الدعم الفني وخدمات ما بعد البيع\n' + SEP + '\nيرجى إدخال اسم العميل. إذا كان الاسم المسجل في طلبك السابق صحيحاً، يمكنك اختياره من الزر أدناه:_';
    } else {
      response = noOpt(goWelcome());
    }
  } else if (step === 'energy_menu') {
    if (text === 'pv_study') {
      lang = 'ar'; menu_choice = '7'; main_loads = ''; city = ''; pvSave({ l: [], c: '', m: '' });
      step = 'pv_loads'; response = loadsTableMsg();
    } else if (text === 'team') {
      lang = 'ar'; menu_choice = '5'; step = 'sup_name';
      response = ' فريق أكتس الدعم الفني وخدمات ما بعد البيع\n' + SEP + '\nيرجى إدخال اسم العميل. إذا كان الاسم المسجل في طلبك السابق صحيحاً، يمكنك اختياره من الزر أدناه:_';
    } else {
      response = noOpt(energyWelcome());
    }
  } else if (step === 'quote_menu') {
    if (text === '1') { step = 'menu_sys3'; response = W(' اختر نوع المنظومة\n' + SEP + '\n1 - السكني\n2 - التجاري\n3 - الصناعي (قريباً)'); }
    else if (text === '2' || text === 'item_request' || text === '3') { response = W(' خدمة طلب صنف محدد موقوفة حالياً\n' + SEP + '\nنعتذر، هذه الخدمة متوقفة مؤقتاً._\nيمكنك اختيار: سكني / تجاري / صناعي، أو التواصل مع المبيعات._'); }
    else { response = noOpt(W(' طلب عرض سعر\n' + SEP + '\nاختر نوع طلبك\n\n1 — السكني والتجاري والصناعي\n2 — طلب صنف محدد\n' + SEP)); }

  } else if (step === 'main_menu') {
    if (text === '1') { step = 'menu_sys3'; response = W(' اختر نوع المنظومة\n' + SEP + '\n1 - السكني\n2 - التجاري\n3 - الصناعي (قريباً)'); }
    else if (text === '2' || text === 'pv_study') { menu_choice = '7'; main_loads = ''; city = ''; pvSave({ l: [], c: '', m: '' }); step = 'pv_loads'; response = loadsTableMsg(); }
    else if (text === '3' || text === 'item_request') { response = W(' خدمة طلب صنف محدد موقوفة حالياً\n' + SEP + '\nنعتذر، هذه الخدمة متوقفة مؤقتاً._\nيمكنك اختيار: سكني / تجاري / صناعي، أو التواصل مع المبيعات._'); }
    else if (text === 'team' || text === 'فريق أكتس') { menu_choice = '5'; step = 'sup_name'; response = ' الدعم الفني وخدمات ما بعد البيع\n' + SEP + '\nيرجى إدخال اسم العميل. إذا كان الاسم المسجل في طلبك السابق صحيحاً، يمكنك اختياره من الزر أدناه:_'; }
    else { response = noOpt(mainMenu()); }

  } else if (step === 'menu_sys3') {
    if (text === '1') { menu_choice = '1'; res_method = ''; step = 'res_bill'; response = resMethodAsk(); }
    else if (text === '2') { menu_choice = '2'; step = 'com_method'; response = comMethodAsk(); }
    else if (text === '3') { response = W(' المسار الصناعي قريباً\n' + SEP + '\nشكراً لاهتمامك بالمنظومات الصناعية!\nنعمل حالياً على إضافة بياناتها وسيكون هذا الخيار متاحاً قريباً._\nحتى ذلك الحين يمكنك اختيار: السكني أو التجاري._'); }
    else { response = noOpt(W(' اختر نوع المنظومة\n' + SEP + '\n1 - السكني\n2 - التجاري')); }


  } else if (step === 'pv_loads') {
    var _pvl = parseLoads(text);
    var _ploadSource = 'MANUAL_24H_PROFILE';
    var _ploadPct = null;
    var _ploadPctNorm = null;
    var _ploadMonthly = NaN;
    if (!_pvl) {
      _ploadMonthly = parseMonthlyKwh(text);
      if (isFinite(_ploadMonthly)) {
        var _lp = monthlyLoadProfile(_ploadMonthly);
        _pvl = _lp ? _lp.hourlyKwh : null;
        _ploadSource = 'MONTHLY_CONSUMPTION_DEFAULT_PROFILE';
        _ploadPct = _lp ? _lp.rawPct : null;
        _ploadPctNorm = _lp ? _lp.normalizedPct : null;
      }
    }
    if (!_pvl) { response = W(' لم نتمكن من قراءة الاستهلاك أو الأحمال._\n' + SEP + '\n') + '\n' + loadsTableMsg(); }
    else {
      var _pvo = pvLoad() || {};
      pvSave({ l: _pvl, c: city || (_pvo.c || ''), m: '', load_source: _ploadSource, load_monthly_kwh: isFinite(_ploadMonthly) ? _ploadMonthly : '', load_daily_kwh: '', load_pct: _ploadPct, load_pct_norm: _ploadPctNorm });
      var _psum = 0, _ppk = 0, _pi;
      for (_pi = 0; _pi < 24; _pi++) { _psum += _pvl[_pi]; if (_pvl[_pi] > _ppk) { _ppk = _pvl[_pi]; } }
      monthly_consumption = String(Math.round(_psum * 30 * 100) / 100);
      peak_load = String(Math.round(_ppk * 100) / 100);
      step = 'pv_sysmode';
      var _profNote = _ploadSource === 'MONTHLY_CONSUMPTION_DEFAULT_PROFILE' ? '\nتم الحساب من الاستهلاك الشهري ÷ 30 ثم التوزيع الساعي حسب منحنى الأحمال المعتمد.' : '\nتم استخدام القيم الساعية المدخلة مباشرة.';
      response = W(' تم استلام أحمالك بنجاح\n' + SEP +
        '\nالاستهلاك الشهري: *' + monthly_consumption + '* kWh\nالاستهلاك اليومي: *' + _psum.toFixed(2) + '* kWh/day\nأعلى حمل ساعي: *' + _ppk.toFixed(2) + '* kW\n' + _profNote + '\n\nاختر نوع المنظومة المطلوبة:_');
    }

  } else if (step === 'pv_sysmode') {
    var _pm = '';
    if (text === 'sys_on' || text === '1') { _pm = 'on'; }
    else if (text === 'sys_off' || text === '2') { _pm = 'off'; }
    else if (text === 'sys_hyb' || text === '3') { _pm = 'hyb'; }
    var _po = pvLoad();
    if (!_pm) { response = noOpt(W(' اختر نوع المنظومة:_')); }
    else if (!_po || !_po.l || _po.l.length !== 24) { step = 'pv_loads'; response = W(' لم يتم إدخال الأحمال بعد._') + '\n' + loadsTableMsg(); }
    else {
      _po.m = _pm; pvSave(_po);
      var _Z = sizeSystem(_po.l, _pm);
      system_type = ''; phase_type = _Z.inv.ph === 3 ? 'three' : 'single';
      inv_pick = SINV_IMG[_Z.inv.key] || null; inv_pick_line = 'انفرتر ' + _Z.inv.model;
      quote_number = 'ACT-STUDY-' + String(Date.now()).slice(-6);
      pv_flow = true;
      step = 'pv_study_ask';
      response = pvSizingText(_Z, _po.c) + '\n' + SEP + '\nهل ترغب بعمل دراسة PVsyst لمنظومتك؟\n\nأرسل 0 للعودة للبداية';
    }

  } else if (step === 'pv_study_ask') {
    if (text === 'study_yes' || text === 'pv_study' || isYesT(text) || /pvsyst|دراسة|دراسه/i.test(String(text))) {
      var _Z3 = pvDesign();
      var _po3 = pvLoad();
      if (_Z3 && _po3) {
        pv_flow = true;
        city = '';
        step = 'pv_site_gov';
        response = pvSiteAsk();
      } else {
        step = 'pv_loads';
        response = W(' تعذر استرجاع بيانات المنظومة، يرجى إعادة إدخال الأحمال._') + '\n' + loadsTableMsg();
      }
    }
    else if (text === 'study_no' || isNoT(text)) { step = 'pv_sld_ask'; response = pvSldAskMsg(); }
    else { response = noOpt(studyAskMsg()); }

  } else if (step === 'pv_sld_ask') {
    var _Z2 = pvDesign();
    if ((text === 'sld_yes' || text === '1' || text === 'نعم') && _Z2) {
      var _po2 = pvLoad();
      make_sld = true;
      pv_flow = true;
      sld_params = pvSldParams(_Z2, _po2 ? _po2.c : city, quote_number || ('ACT-SLD-' + String(Date.now()).slice(-6)));
      step = 'pv_quote_ask';
      followup_kind = 'pvquote';
      response = '';
    } else if (text === 'sld_no' || text === '2' || text === 'لا') {
      step = 'pv_quote_ask';
      response = pvQuoteAskMsg();
    } else {
      response = noOpt(pvSldAskMsg());
    }

  } else if (step === 'pv_quote_ask') {
    var _iq = indGet();
    if ((text === 'pv_q_yes' || text === '1' || text === 'نعم') && _iq && _iq.name) {
      customer_name = _iq.name; quote_number = _iq.qn || quote_number;
      if (pvIssueQuote()) { step = 'buy_ask'; followup_kind = 'buy'; } else { response = noOpt(pvQuoteAskMsg()); }
    } else if (text === 'pv_q_yes' || text === '1' || text === 'نعم') {
      step = 'pv_quote_name';
      response = W(' إصدار عرض السعر الرسمي\n' + SEP + '\nيرجى تزويدنا باسم العميل أو اسم الجهة ليُدرج في عرض السعر.\nإذا كان الاسم المسجل في طلبك السابق صحيحاً، يمكنك اختياره من الزر أدناه:_');
    } else if (text === 'pv_q_no' || text === '2' || text === 'لا') {
      step = 'buy_ask';
      response = buyAskMsg();
    } else {
      response = noOpt(pvQuoteAskMsg());
    }

  } else if (step === 'pv_quote_name') {
    if (text === '__media__' || !text) { response = noOpt(W(' يرجى إدخال اسم العميل:_')); }
    else {
      customer_name = text;
      if (pvIssueQuote()) { step = 'buy_ask'; followup_kind = 'buy'; }
      else { step = 'pv_loads'; response = W(' تعذر استرجاع بيانات الدراسة._') + '\n' + loadsTableMsg(); }
    }

  } else if (step === 'menu_res_com') {
    if (text === '1') { menu_choice = '1'; res_method = ''; step = 'res_bill'; response = resMethodAsk(); }
    else if (text === '2') { menu_choice = '2'; step = 'com_method'; response = comMethodAsk(); }
    else { response = noOpt(W('اختر نوع النظام:')); }

  } else if (step === 'menu_ind_agr') {
    if (text === '1') { menu_choice = '3'; step = 'ind_name'; response = indNameAsk(); }
    else if (text === '2') { menu_choice = '4'; step = 'agr_bill'; response = billAsk('4'); }
    else { response = noOpt(W('اختر نوع النظام:')); }

  } else if (step === 'res_bill') {
    if (text === '__media__') { response = textOnly(); }
    else if (text === 'browse' || /تصفح|المنظومات الجاهزة/.test(String(text))) {
      step = 'res_browse_inv';
      response = resBrowseInvMsg();
    }
    else {
      res_method = '1'; activity_type = 'res_1';
      var vb0 = billValue(text);
      if (isNaN(vb0) || vb0 <= 0) { response = noOpt(resMethodAsk()); }
      else {
        monthly_consumption = String(Math.round(vb0 * 100) / 100);
        var dn0 = resDailyNeed(vb0);
        if (isNaN(dn0)) { response = noOpt(resMethodAsk()); }
        else if (dn0 > RES_MAX_DAILY + 0.0001) { resToCommercial(vb0); }
        else {
          var pk0 = resNearest(dn0);
          if (pk0.list.length > 1) { step = 'res_tie'; response = resTieAsk(pk0.list, dn0); }
          else { resApplySelected(pk0.list[0].code); }
        }
      }
    }
  } else if (step === 'res_value') {
    if (text === '__media__') { response = textOnly(); }
    else {
      var rm1 = res_method || '1';
      var vb1 = billValue(text);
      // توحيد طرق الإدخال إلى ما يعادل قيمة الفاتورة الشهرية بالريال (كيلووات/شهر × سعر الكيلو، لتر ديزل ÷ 0.27 × سعر الكيلو)
      if (!isNaN(vb1) && vb1 > 0 && rm1 === '2') { vb1 = vb1 * KWH_PRICE; }
      else if (!isNaN(vb1) && vb1 > 0 && rm1 === '3') { vb1 = (vb1 / 0.27) * KWH_PRICE; }
      if (isNaN(vb1) || vb1 <= 0) { response = noOpt(resValueAsk(rm1)); }
      else {
        monthly_consumption = String(Math.round(vb1 * 100) / 100);
        if (rm1 === '2') { project_type = 'LC=' + String(Math.round(parseFloat(String(text).replace(/,/g, '')) * 100) / 100); }
        var dn1 = resDailyNeed(vb1);
        if (isNaN(dn1)) { response = noOpt(resValueAsk(rm1)); }
        else if (dn1 > RES_MAX_DAILY + 0.0001) { resToCommercial(vb1); }
        else {
          var pk1 = resNearest(dn1);
          if (pk1.list.length > 1) { step = 'res_tie'; response = resTieAsk(pk1.list, dn1); }
          else { resApplySelected(pk1.list[0].code); }
        }
      }
    }
  } else if (step === 'res_tie') {
    var tl = resTieList();
    var tcode = '';
    var mt = String(text).match(/^restie_(r\d+)$/);
    if (mt) { tcode = mt[1]; }
    else { var tn = parseInt(text, 10); if (tn >= 1 && tn <= tl.length && String(tn) === String(text).trim()) { tcode = tl[tn - 1].code; } }
    if (tcode && RES_BY_CODE[tcode]) { resApplySelected(tcode); }
    else { response = noOpt(resTieAsk(tl, resDailyNeed(monthly_consumption) || 0)); }
  } else if (step === 'res_browse_inv') {
    var ckw = null;
    var mc = String(text).match(/^resinv_([\d.]+)$/);
    if (mc) { ckw = parseFloat(mc[1]); }
    else { var cn = parseInt(text, 10); if (cn >= 1 && cn <= RES_INV_CLASSES.length && String(cn) === String(text).trim()) { ckw = RES_INV_CLASSES[cn - 1].kw; } }
    if (ckw !== null && resListOfClass(ckw).length) { activity_type = 'resinv_' + ckw; step = 'res_browse'; response = resBrowseMsg(); }
    else { response = noOpt(resBrowseInvMsg()); }
  } else if (step === 'res_browse') {
    var blist = resListOfClass(resInvSel());
    var bcode = '';
    var mb = String(text).match(/^sys_(r\d+)$/);
    if (mb) { bcode = mb[1]; }
    else { var bn = parseInt(text, 10); if (bn >= 1 && bn <= blist.length && String(bn) === String(text).trim()) { bcode = blist[bn - 1].code; } }
    if (bcode && RES_BY_CODE[bcode]) {
      monthly_consumption = String(Math.round(RES_BY_CODE[bcode].daily * 30 * KWH_PRICE));
      resApplySelected(bcode);
    } else {
      response = noOpt(resBrowseMsg());
    }
  } else if (step === 'com_method') {
    if (text === '1' || text === '2' || text === '3') { activity_type = 'com_' + text; step = 'com_value'; response = comValueAsk(text); }
    else { response = noOpt(comMethodAsk()); }
  } else if (step === 'com_value') {
    if (text === '__media__') { response = textOnly(); }
    else {
      var cm = activity_type.replace('com_', '');
      var cv = parseFloat(String(text).replace(/,/g, ''));
      if (isNaN(cv) || cv <= 0) { response = noOpt(comValueAsk(cm)); }
      else {
        var ckwh = cm === '1' ? cv / 250 : (cm === '2' ? cv : cv / 0.27);
        monthly_consumption = String(cv);
        if (cm === '2') { project_type = 'LC=' + String(Math.round(cv * 100) / 100); }
        peak_load = String(Math.round(ckwh * 100) / 100);
        var _comOptsNow = comInvOptions();
        if (!_comOptsNow.length) { response = comNoInvOfferEscalate(); }
        else if (_comOptsNow.length === 1) {
          comSelectInvKw(Number(_comOptsNow[0].kw));
        } else {
          step = 'com_inv_ask'; response = comInvAsk();
        }
      }
    }
  } else if (step === 'ind_name') {
    if (text === '__media__' || !text) { response = noOpt(indNameAsk()); }
    else { indInit(text); customer_name = text; city = ''; step = 'ind_loc_gov'; response = indLocAsk(); }

  } else if (step === 'ind_activity') {
    if (text === '__media__' || !text) { response = noOpt(indActivityAsk()); }
    else {
      var _ia = String(text).replace(/^ind_act_/, '');
      indSet({ act: IND_ACTS[_ia] || String(text) });
      activity_type = IND_ACTS[_ia] || String(text);
      step = 'ind_shifts'; response = indShiftsAsk();
    }

  } else if (step === 'ind_shifts') {
    var _ns = parseInt(String(text).replace(/^shifts_/, ''), 10);
    if (_ns >= 1 && _ns <= 3) { indSet({ nsh: _ns, cur: 1, shifts: [] }); step = 'ind_shift'; response = indShiftAsk(1); }
    else { response = noOpt(indShiftsAsk()); }

  } else if (step === 'ind_shift') {
    var _ind1 = indGet() || { cur: 1, nsh: 1, shifts: [] };
    var _sh = indParseShift(text);
    if (text === '__media__' || !_sh) { response = W(' لم نتمكن من قراءة وقت الوردية._\n' + SEP) + '\n' + indShiftAsk(_ind1.cur || 1); }
    else {
      _ind1.shifts.push(_sh);
      if (_ind1.cur < _ind1.nsh) { _ind1.cur += 1; indSet({ shifts: _ind1.shifts, cur: _ind1.cur }); response = indShiftAsk(_ind1.cur); }
      else {
        indSet({ shifts: _ind1.shifts, cur: _ind1.cur });
        var _hs = indHoursSummary(_ind1);
        daily_hours = String(_hs.total); night_hours = String(_hs.night);
        step = 'ind_load_src';
        response = W(' تم تسجيل الورديات\n' + SEP + '\n' + indShiftsText(_ind1)) + '\n\n' + indLoadSrcAsk();
      }
    }

  } else if (step === 'ind_load_src') {
    var _ls = String(text).replace(/^loads_/, '');
    if (_ls === '1' || _ls === '2') { indSet({ loadsrc: _ls === '1' ? 'ملف' : 'صورة' }); step = 'ind_load_file'; response = indLoadFileAsk(); }
    else if (_ls === '3') { indSet({ loadsrc: 'يدوي' }); step = 'ind_total_kw'; response = indTotalAsk(); }
    else if (text === '__media__') { indSet({ loadsrc: 'ملف', file: true }); step = 'ind_total_kw'; response = W(' تم استلام الملف\n' + SEP + '\nشكراً، سيراجعه المهندس المختص._') + '\n\n' + indTotalAsk(); }
    else { response = noOpt(indLoadSrcAsk()); }

  } else if (step === 'ind_load_file') {
    if (text === '__media__') { indSet({ file: true }); step = 'ind_total_kw'; response = W(' تم استلام الملف\n' + SEP + '\nشكراً، سيراجعه المهندس المختص._') + '\n\n' + indTotalAsk(); }
    else if (text === 'skip' || /تخطي|تخطى|skip/i.test(String(text))) { step = 'ind_total_kw'; response = indTotalAsk(); }
    else { response = noOpt(indLoadFileAsk()); }

  } else if (step === 'ind_total_kw') {
    var _tk = indNum(text);
    if (text === '__media__') { indSet({ file: true }); response = W(' تم استلام الملف\n' + SEP) + '\n' + indTotalAsk(); }
    else if (isNaN(_tk) || _tk <= 0) { response = noOpt(indTotalAsk()); }
    else { indSet({ tot: _tk }); peak_load = String(_tk); step = 'ind_max_mach'; response = indMaxAsk(); }

  } else if (step === 'ind_max_mach') {
    var _mk2 = indNum(text);
    if (isNaN(_mk2) || _mk2 <= 0) { response = noOpt(indMaxAsk()); }
    else { indSet({ maxm: _mk2 }); step = 'ind_motors'; response = indMotorsAsk(); }

  } else if (step === 'ind_motors') {
    if (text === 'motors_yes' || isYesT(text)) { step = 'ind_motor_kw'; response = indMotorKwAsk(); }
    else if (text === 'motors_no' || isNoT(text)) { indSet({ motorkw: 0 }); step = 'ind_source'; response = indSourceAsk(); }
    else { response = noOpt(indMotorsAsk()); }

  } else if (step === 'ind_motor_kw') {
    var _mw = indNum(text);
    if (isNaN(_mw) || _mw <= 0) { response = noOpt(indMotorKwAsk()); }
    else { indSet({ motorkw: _mw }); step = 'ind_source'; response = indSourceAsk(); }

  } else if (step === 'ind_source') {
    var _sr = String(text).replace(/^src_/, '');
    if (_sr === '1' || _sr === '2') { indSet({ src: _sr }); step = 'ind_gen_kva'; response = indGenAsk(); }
    else if (_sr === '3') { indSet({ src: _sr, genkva: 0, diesel: 0 }); step = 'ind_goal'; response = indGoalAsk(); }
    else if (_sr === '4') { indSet({ src: _sr, genkva: 0, diesel: 0 }); step = 'ind_old_pv'; response = indOldPvAsk(); }
    else { response = noOpt(indSourceAsk()); }

  } else if (step === 'ind_gen_kva') {
    var _gk = (text === 'unknown' || /لا اعرف|لا أعرف|لااعرف/.test(String(text))) ? 0 : indNum(text);
    if (isNaN(_gk) || _gk < 0) { response = noOpt(indGenAsk()); }
    else { indSet({ genkva: _gk }); step = 'ind_diesel'; response = indDieselAsk(); }

  } else if (step === 'ind_diesel') {
    var _dl = (text === 'unknown' || /لا اعرف|لا أعرف|لااعرف/.test(String(text))) ? 0 : indNum(text);
    if (isNaN(_dl) || _dl < 0) { response = noOpt(indDieselAsk()); }
    else { indSet({ diesel: _dl }); step = 'ind_goal'; response = indGoalAsk(); }

  } else if (step === 'ind_old_pv') {
    var _op = indNum(text);
    if (isNaN(_op) || _op < 0) { response = noOpt(indOldPvAsk()); }
    else { indSet({ pvold: _op }); step = 'ind_goal'; response = indGoalAsk(); }

  } else if (step === 'ind_goal') {
    var _gl = String(text).replace(/^goal_/, '');
    if (_gl !== '1' && _gl !== '2' && _gl !== '3') { response = noOpt(indGoalAsk()); }
    else {
      indSet({ goal: _gl, c: city, qn: 'ACTES-IND-' + String(Date.now()).slice(-6) });
      var _indZ = indSizing();
      var _indI = indGet();
      if (!_indZ || !_indI) { step = 'ind_name'; response = W(' تعذر استرجاع بيانات المشروع، يرجى البدء من جديد._') + '\n' + indNameAsk(); }
      else if (_indZ.nInv > IND_MAX_INV) { response = indOutOfRange(_indI); }
      else {
        system_type = ''; phase_type = _indZ.inv.ph === 3 ? 'three' : 'single';
        monthly_consumption = String(Math.round(_indZ.daily * 30));
        peak_load = String(_indZ.peak);
        inv_pick = SINV_IMG[_indZ.inv.key] || null; inv_pick_line = 'انفرتر ' + _indZ.inv.model;
        quote_number = _indI.qn;
        pv_flow = true;
        notify_employee = true;
        notification_text = notifInd(_indZ, _indI, 'طلب منظومة صناعية جديد');
        step = 'ind_result';
        response = indSummaryText(_indZ, _indI);
      }
    }

  } else if (step === 'ind_result') {
    var _rz = pvDesign(); var _ri = indGet(); var _ro = indLoad();
    if (!_rz || !_ri) { step = 'ind_name'; response = W(' تعذر استرجاع بيانات المشروع، يرجى البدء من جديد._') + '\n' + indNameAsk(); }
    quote_number = _ri && _ri.qn ? _ri.qn : quote_number;
    if (!_rz || !_ri) { }
    else if (text === 'ind_quote' || text === '1' || /سعر|عرض/.test(String(text))) {
      pv_flow = true;
      customer_name = customer_name || _ri.name || '';
      if (pvIssueQuote()) { step = 'buy_ask'; followup_kind = 'buy'; }
      else { response = noOpt(indResultAsk()); }
    }
    else if (text === 'ind_study' || text === '2' || /دراس|pvsyst/i.test(String(text))) {
      pv_flow = true;
      if (cityKnown()) {
        _ro.c = city; pvSave(_ro);
        send_study_file = true;
        study_params = pvStudyParams(_rz, city, _ro.l, quote_number || ('ACT-STUDY-' + String(Date.now()).slice(-6)));
        step = 'pv_sld_ask'; followup_kind = 'sld'; response = '';
      } else { city = ''; step = 'pv_site_gov'; response = pvSiteAsk(); }
    }
    else if (text === 'ind_sld' || text === '3' || /مخطط|sld/i.test(String(text))) {
      pv_flow = true;
      make_sld = true;
      sld_params = pvSldParams(_rz, _ri.c || city, quote_number || ('ACT-SLD-' + String(Date.now()).slice(-6)));
      step = 'pv_quote_ask'; followup_kind = 'pvquote'; response = '';
    }
    else if (text === 'buy_invoice') { customer_name = customer_name || _ri.name || ''; response = goBuy(); }
    else { response = noOpt(indResultAsk()); }

  } else if (step === 'agr_bill') {
    if (text === '__media__') { response = textOnly(); }
    else { var va = billValue(text); if (isNaN(va) || va <= 0) { response = noOpt(billAsk('4')); } else { monthly_consumption = String(va); var lka = lookupByBill(va, '4'); if (!lka) { step = 'done'; notify_employee = true; notification_text = notifQuote('-', monthly_consumption, '', menu_choice, true); response = outOfRange(); } else { step = 'agr_quote_ask'; response = billResult(lka, '4'); } } }

  } else if (step === 'com_visit_ask') {
    if (text === '1') {
      wants_quote = 'yes';
      step = 'com_quote_name';
      response = m('ask_name');
    }
    else if (text === '2') { step = 'com_visit_date'; response = comVisitDateAsk(); }
    else { response = noOpt(W(comVisitAsk())); }
  } else if (step === 'com_quote_name') {
    if (text === '__media__') { response = textOnly(); }
    else {
      customer_name = text;
      var phLbl = phase_type === 'three' ? 'Three Phase (3 فاز)' : 'Single Phase (1 فاز)';
      step = 'done';
      notify_employee = true;
      notification_text = notifCom(customer_name || '-', activity_type.replace('com_', ''), monthly_consumption, parseFloat(peak_load) || 0, night_hours, system_type + ' | ' + phLbl, false);
      var _mq1 = comIssueMultiQuote(customer_name || '...........');
      if (_mq1 === 'ok') {
        step = 'qnext_ask';
        followup_kind = 'qnext';
      } else if (_mq1 === 'escalate') {
        step = 'done';
      } else if (load_type && COM_QUOTES[load_type]) {
        response = comQuoteText(load_type, customer_name || '...........', system_type + ' — ' + phLbl);
        send_quote_file = true;
        item_quote = true;
        quote_items = stripBaseItems(comQuoteItems(load_type));
        quote_number = COM_QUOTES[load_type].num;
        quote_file_url = COM_QUOTES[load_type].url;
        quote_file_name = 'عرض سعر ' + COM_QUOTES[load_type].num + '.pdf';
        quote_caption = quoteAfterPdf(quote_items);
        step = 'qnext_ask';
        followup_kind = 'qnext';
      } else { response = m('contact_ok'); }
    }
  } else if (step === 'com_visit_date') {
    if (text === '__media__') { response = textOnly(); }
    else { daily_hours = text; step = 'com_visit_facility'; response = comVisitFacilityAsk(); }
  } else if (step === 'com_visit_facility') {
    if (text === '__media__') { response = textOnly(); }
    else { main_loads = text; city = ''; step = 'com_visit_location_gov'; response = comVisitLocationAsk(); }

  } else if (step === 'res_quote_ask' || step === 'agr_quote_ask' || step === 'com_quote_ask' || step === 'qnext_ask') {
    if (step !== 'res_quote_ask' && (text === 'aq_plan' || /PVsyst\s*ومخطط|الدراسة والمخطط/i.test(String(text)))) { step = 'plan_pick'; response = planPickMsg(); }
    else if (step !== 'res_quote_ask' && (text === 'aq_study' || text === 'study_yes' || /pvsyst|دراسة|دراسه/i.test(String(text)))) { step = 'study_ask'; response = studyAskMsg(); }
    else if (step !== 'res_quote_ask' && (text === 'aq_sld' || text === 'sld_yes' || /مخطط|sld/i.test(String(text)))) { step = 'sld_ask'; response = sldAskMsg(); }
    else if (text === 'aq_buy' || text === 'buy_invoice' || /شراء|متابعة/.test(String(text))) { response = goBuy(); }
    else if (text === '1') { wants_quote = 'yes'; step = 'quote_name'; response = askNameMsg(); }
    else if (text === '2') { wants_quote = 'no'; step = 'done'; response = m('no_quote'); }
    else { response = noOpt(step === 'res_quote_ask' ? billResult({ code: system_type, name: (RES_BY_CODE[system_type] || {}).name || '' }, '1') : m('quote_next')); }

  } else if (step === 'plan_pick') {
    if (text === 'aq_study' || text === 'study_yes' || /pvsyst|دراسة|دراسه/i.test(String(text))) {
      city = '';
      step = 'study_city_gov';
      response = studySiteAsk();
    }
    else if (text === 'aq_sld' || text === 'sld_yes' || /مخطط|sld/i.test(String(text))) { step = 'sld_ask'; response = sldAskMsg(); }
    else { response = noOpt(planPickMsg()); }

  } else if (step === 'ind_quote_ask') {
    if (text === '1') { wants_quote = 'yes'; step = 'quote_name'; response = m('ask_name'); }
    else if (text === '2') { wants_quote = 'no'; step = 'done'; response = m('no_quote'); }
    else { response = noOpt(m('quote_ask')); }

  } else if (step === 'com_inv_ask') {
    var _opts = comInvOptions();
    // حماية إضافية: إذا أصبحت الخيارات خياراً واحداً قبل معالجة الرسالة، اعتمده تلقائياً.
    if (_opts.length === 1) {
      comSelectInvKw(Number(_opts[0].kw));
    } else {
      var _mk = String(text).match(/^invkw_([\d.]+)$/);
      var _kw = 0;
      if (_mk) { _kw = parseFloat(_mk[1]); }
      else { var _n = parseInt(text, 10); if (_n >= 1 && _n <= _opts.length && String(_n) === String(text).trim()) { _kw = _opts[_n - 1].kw; } }
      var _okw = false;
      for (var _oi = 0; _oi < _opts.length; _oi++) { if (_opts[_oi].kw === _kw) { _okw = true; break; } }
      if (!_opts.length) { response = comNoInvOfferEscalate(); }
      else if (!_okw) { response = noOpt(comInvAsk()); }
      else { comSelectInvKw(_kw); }
    }

  } else if (step === 'com_phase_ask') {
    if (text === '1' || text === '2') {
      phase_type = text === '1' ? 'single' : 'three';
      comApplyResult();
    } else { response = noOpt(comPhaseAsk()); }

  } else if (step === 'quote_name') {
    if (text === '__media__') { response = textOnly(); }
    else {
      customer_name = text;
      finalizeQuote();
    }

  } else if (step === 'item_menu') {
    var catMap = { '1': 'pv', 'item_pv': 'pv', '2': 'inv', 'item_inv': 'inv', '3': 'bat', 'item_bat': 'bat', '4': 'acc', 'item_acc': 'acc', '5': 'ess', 'item_ess': 'ess', '6': 'saf', 'item_saf': 'saf', '7': 'mnt', 'item_mnt': 'mnt' };
    var cid = catMap[text];
    if (!cid) { response = itemNotAvailable(itemMenuMsg()); }
    else {
      load_type = cid;
      activity_type = catOf(cid).title;
      step = 'item_pick';
      response = W(' *' + catOf(cid).title + '\n' + SEP + '\nاختر الصنف المطلوب:_\n\n' + itemListMsg(cid));
    }

  } else if (step === 'item_pick') {
    var selIt = itemPickIn(load_type, text);
    if (!selIt) { response = itemNotAvailable(W('اختر الصنف المطلوب:_\n\n' + itemListMsg(load_type))); }
    else {
      device_type = selIt[0];
      pump_capacity = selIt[1];
      step = 'item_qty';
      response = askQty(selIt[4]);
    }

  } else if (step === 'item_qty') {
    var itQ = parseFloat(String(text).replace(/[^0-9.]/g, ''));
    var curIt = null, ci;
    var curCat = catOf(load_type);
    if (curCat) {
      for (ci = 0; ci < curCat.items.length; ci++) { if (curCat.items[ci][0] === device_type) { curIt = curCat.items[ci]; } }
    }
    if (!curIt) { step = 'item_menu'; response = itemMenuMsg(); }
    else if (isNaN(itQ) || itQ <= 0) { response = noOpt(askQty(curIt[4])); }
    else {
      addToCart(curIt, itQ);
      main_loads = String(itQ) + ' ' + curIt[2];
      // بعد إضافة أي صنف (بما فيها الانفرتر): يُسجَّل ويُعرض خيار إضافة صنف آخر أو طلب عرض سعر
      step = 'item_next';
      response = itemNextMsg(load_type === 'inv' ? ' تمت إضافة الانفرتر' : ' تمت إضافة الصنف');
    }

  } else if (step === 'item_next') {
    if (text === '1' || text === 'item_go_pv') {
      load_type = 'pv'; activity_type = catOf('pv').title; step = 'item_pick'; response = catAskMsg('pv');
    } else if (text === '2' || text === 'item_go_acc') {
      load_type = 'acc'; activity_type = catOf('acc').title; step = 'item_pick'; response = catAskMsg('acc');
    } else if (text === '3' || text === 'item_go_quote') {
      if (!cart.length) { step = 'item_menu'; response = itemNotAvailable(itemMenuMsg()); }
      else { step = 'item_name'; response = askItemName(); }
    } else if (text === '4' || text === 'item_add_more') {
      step = 'item_menu'; response = itemMenuMsg();
    } else { response = noOpt(itemNextMsg('')); }

  } else if (step === 'item_cart') {
    if (text === '1' || text === 'item_add_more') { step = 'item_menu'; response = itemMenuMsg(); }
    else if (text === '2' || text === 'item_make_quote') {
      if (!cart.length) { step = 'item_menu'; response = itemNotAvailable(itemMenuMsg()); }
      else { step = 'item_name'; response = askItemName(); }
    }
    else if (text === '3' || text === 'item_clear') { cart = []; step = 'item_menu'; response = W(' تم إفراغ السلة\n' + SEP + '\n') + '\n' + itemMenuMsg(); }
    else { response = noOpt(cartMsg('')); }

  } else if (step === 'item_name') {
    if (text === '__media__') { response = textOnly(); }
    else if (!String(text).trim()) { response = noOpt(askItemName()); }
    else { customer_name = String(text).trim(); issueItemQuote(); }

  } else if (step === 'sup_name') { if (text === '__media__') { response = textOnly(); } else { customer_name = text; city = ''; step = 'sup_city_gov'; response = locGovAsk(' الدعم الفني موقعك\nيرجى اختيار المحافظة من القائمة التالية._'); }
  } else if (step === 'sup_city') { if (text === '__media__') { response = textOnly(); } else { city = text; step = 'sup_device'; response = SEP + '\n نوع الجهاز / النظام الذي فيه المشكلة :_'; }
  } else if (step === 'sup_device') { if (text === '__media__') { response = textOnly(); } else { device_type = text; step = 'sup_problem'; response = SEP + '\n وصف المشكلة:_\n_( يمكنك أيضاً إرسال صورة أو فيديو )_'; }
  } else if (step === 'sup_problem') {
    if (text === '__media__') { response = SEP + '\n تم استلام الملف._\nيرجى وصف المشكلة بالنص:_'; }
    else { problem_desc = text; step = 'done'; notify_employee = true; notification_text = buildNotif('sup', { cn: customer_name, ci: city, dev: device_type, prob: problem_desc }); response = SEP + '\n تم تسجيل طلب الدعم الفني بنجاح!*\nسيتواصل معك فريق الدعم قريباً._\n' + SEP + '\n _0-للعودة للبداية'; }

  } else if (step === 'con_name') { if (text === '__media__') { response = textOnly(); } else { customer_name = text; step = 'con_project'; response = W(' نوع المشروع:_'); }
  } else if (step === 'con_project') { if (text === '__media__') { response = textOnly(); } else { project_type = text; step = 'con_service'; response = W(' الخدمة المطلوبة:_'); }
  } else if (step === 'con_service') {
    if (text === '__media__') { response = textOnly(); }
    else { service_needed = text; step = 'done'; notify_employee = true; notification_text = buildNotif('con', { cn: customer_name, pt: project_type, sn: service_needed }); response = m('contact_ok'); }
  } else if (/_gov$/.test(step) && LOC_BASE[step.slice(0, -4)]) {
    function __normGovName(v) {
      return String(v || '').trim().replace(/^[*_.\s]+|[*_.\s]+$/g, '').replace(/^محافظة\s*/i, '').replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, '');
    }
    function __findGovByName(v) {
      var q = __normGovName(v), i, g, gn;
      if (!q) { return null; }
      for (i = 0; i < GOVS.length; i++) {
        g = GOVS[i]; gn = __normGovName(g.n);
        if (q === gn || (q === 'صنعاء' && (gn === 'صنعاء' || gn === 'امانةالعاصمه'))) { return g; }
      }
      // الاسم المتداول "أمانة العاصمة" يقبل أيضاً كاسم المحافظة.
      if (q === 'امانةالعاصمه') { return GOVS[0]; }
      return null;
    }
    if (text === 'gov_other') {
      city = '__OTHER_GOV_LIST__';
      response = (step === 'study_city_gov') ? locGovOtherAsk(true) : locGovOtherAsk(false);
    } else if (/^gov_other_\d+$/.test(String(text))) {
      var __otherGi = parseInt(String(text).replace('gov_other_', ''), 10);
      if (__otherGi >= 1 && __otherGi <= GOVS.length) {
        city = GOVS[__otherGi - 1].n;
        locApply(step.slice(0, -4));
      } else { response = noOpt(locGovAsk('')); }
    } else if (text === 'gov_sanaa' || text === 'gov_aden') {
      var __quickMap = { gov_sanaa: 'صنعاء', gov_aden: 'عدن' };
      var __qg = __findGovByName(__quickMap[text]);
      if (__qg) { city = __qg.n; locApply(step.slice(0, -4)); }
      else { response = noOpt(locGovAsk('')); }
    } else if (String(city || '') === '__OTHER_GOV__') {
      if (text === '__media__') { response = textOnly(); }
      else {
        var __typedGov = __findGovByName(text);
        if (!__typedGov) {
          response = W('❗ إدخال غير صحيح\n' + SEP + '\nلا توجد محافظة يمنية بهذا الاسم.\n\nيرجى كتابة اسم محافظة يمنية صحيح، مثل: تعز، إب، الحديدة، ذمار.');
        } else {
          city = __typedGov.n;
          locApply(step.slice(0, -4));
        }
      }
    } else {
      // دعم التوافق مع الرسائل القديمة التي قد ترسل رقماً للمحافظة.
      var _gi = parseInt(text, 10);
    if (text === '__media__') { response = textOnly(); }
    else if (text === 'loc_more') {
      var _tpg = locPages(GOVS.length);
      city = 'PG:' + ((govPage() % _tpg) + 1);
      response = locGovAsk('');
    }
    else if (!(_gi >= 1 && _gi <= GOVS.length) || String(_gi) !== String(text).trim()) { response = noOpt(locGovAsk('')); }
    else {
      var _baseG = step.slice(0, -4);
      // يُسأل عن المحافظة فقط — لا يوجد سؤال عن المنطقة
      city = GOVS[_gi - 1].n;
      locApply(_baseG);
    }
    }

  } else if (/_dist$/.test(step) && LOC_BASE[step.slice(0, -5)]) {
    var _base = step.slice(0, -5);
    var _gi2 = parseInt(String(city).split('|')[0], 10);
    var _gov = (_gi2 >= 1 && _gi2 <= GOVS.length) ? GOVS[_gi2 - 1] : null;
    var _di = parseInt(text, 10);
    if (text === '__media__') { response = textOnly(); }
    else if (!_gov) { city = ''; step = _base + '_gov'; response = locGovAsk(''); }
    else if (text === 'loc_back_gov') { city = ''; step = _base + '_gov'; response = locGovAsk(''); }
    else if (text === 'loc_more') {
      var _tpd = locPages(_gov.d.length);
      city = String(_gi2) + '|' + _gov.n + '|' + ((distPage(_gov.d.length) % _tpd) + 1);
      response = locDistAsk(_gi2);
    }
    else if (!String(text).trim()) { response = noOpt(locDistAsk(_gi2)); }

    else {
      var _dtxt = String(text).trim();
      if (_di >= 1 && _di <= _gov.d.length && String(_di) === _dtxt) { city = _gov.n + ' - ' + _gov.d[_di - 1]; }
      else { city = _gov.n + ' - ' + _dtxt; }
      locApply(_base);
    }

  } else if (step === 'done') { response = noOpt(m('back'));
  } else if (step === 'buy_ask') {
    if (text === 'sales_contact') { salesHandoff('التواصل مع المبيعات'); step = 'done'; response = salesLinkMsg(); }
    else if (text === 'buy_invoice' || isYesT(text) || /شراء|فاتور/.test(String(text))) { salesHandoff('متابعة الشراء'); response = goBuy(); }
    else { response = noOpt(buyAskMsg()); }


  } else if (step === 'study_ask') {
    if (text === 'sales_contact') { salesHandoff('التواصل مع المبيعات'); step = 'done'; response = salesLinkMsg(); }
    else if (text === 'study_yes' || text === 'pv_study' || isYesT(text) || /pvsyst|دراسة|دراسه/i.test(String(text))) {
      if (cityKnown()) { send_study_file = true; step = 'sld_ask'; response = ''; followup_kind = 'sld'; }
      else { city = ''; step = 'study_city_gov'; response = studySiteAsk(); }
    }
    else if (text === 'buy_invoice') { response = goBuy(); }
    else if (text === 'study_no' || isNoT(text)) { step = 'sld_ask'; response = sldAskMsg(); }
    else { response = noOpt(studyAskMsg()); }


  } else if (step === 'sld_ask') {
    if (text === 'sld_yes' || isYesT(text) || /مخطط|خط واحد|sld|dxf|dwg/i.test(String(text))) {
      if (city && String(city).indexOf('|') < 0) {
        // ثبّت نسخة العرض الرسمي نفسها داخل sld_params قبل إنشاء المخطط.
        var __sldItems = (quote_context && Array.isArray(quote_context.quote_items)) ? quote_context.quote_items :
          (Array.isArray(quote_items) && quote_items.length ? quote_items : []);
        sld_params = {
          quote_number: quote_number || (quote_context && quote_context.quote_number) || '',
          customer_name: customer_name || (quote_context && quote_context.customer_name) || '',
          city_en: city || (quote_context && quote_context.city) || '',
          quote_items: __sldItems,
          quote_source: 'FORMAL_QUOTATION_SNAPSHOT'
        };
        make_sld = true;
        step = 'buy_ask';
        response = '';
        // لا ترسل متابعة الشراء تلقائياً بعد الضغط على SLD.
        followup_kind = '';
      } else {
        city = ''; step = 'study_city_sld_gov'; response = studySiteAsk('sld');
      }
    }
    else if (text === 'sld_no' || isNoT(text)) { step = 'buy_ask'; response = buyAskMsg(); }
    else if (text === 'buy_invoice') { response = goBuy(); }
    else { response = noOpt(sldAskMsg()); }


  } else if (step === 'pay_method') {
    if (text === '1' || text === 'pay_network') { service_needed = 'حوالة شبكة محلية'; step = 'pay_notice'; response = payAccountsMsg(); }
    else if (text === '2' || text === 'pay_wallet') { service_needed = 'محفظة إلكترونية'; step = 'pay_notice'; response = payAccountsMsg(); }
    else if (text === '3' || text === 'pay_cod') {
      var payLbl3 = 'الدفع عند الاستلام';
      service_needed = payLbl3;
      step = 'done'; notify_employee = true; notification_text = notifBuy(payLbl3);
      response = buyDoneMsg(payLbl3);
    }
    else { response = noOpt(payMethodAsk()); }

  } else if (step === 'pay_network' || step === 'pay_network_name' || step === 'pay_wallet' || step === 'pay_wallet_name') {
    // خطوات قديمة: لم نعد نسأل عن اسم المحفظة أو الشبكة
    if (!service_needed) { service_needed = (step.indexOf('wallet') >= 0) ? 'محفظة إلكترونية' : 'حوالة شبكة محلية'; }
    step = 'pay_notice';
    response = payAccountsMsg();

  } else if (step === 'pay_notice') {
    var payWay = String(session.service_needed || service_needed || 'حوالة');
    service_needed = payWay;
    step = 'done';
    notify_employee = true;
    notification_text = payNotifShort(payWay);
    forwardNoticeToFinance();
    extra_payloads.push(financeConfirmPayload());
    response = noticeReceivedMsg();

  } else { step = 'welcome_services'; response = noOpt(goWelcome()); }




  // ===================== متابعة الشراء وفاتورة الشراء =====================
  function studySiteAsk(kind) {
    if (kind === 'sld') {
      return locGovAsk(' مخطط SLD (Single Line Diagram)\nقبل البدء نحدد موقع المشروع لجلب بيانات الإشعاع الشمسي الخاصة به._');
    }
    return locGovAsk(' دراسة المحاكاة الشمسية (PVsyst)\n' +
      'تقرير فني مختصر يوضح الإنتاج الشهري والسنوي ونسبة الأداء PR ونسبة الاعتماد على الطاقة الشمسية ومواصفات المنظومة._\n' +
      'نحدد أولاً موقع المشروع لجلب بيانات الإشعاع الشمسي الخاصة به._');
  }
  function isYesT(t) { return t === '1' || /^(نعم|أجل|اجل|ايوه|أيوه|تمام|ok|yes|y)$/i.test(String(t || '').trim()); }
  function isNoT(t) { return t === '2' || /^(لا|كلا|لاشكرا|لا شكرا|لا شكراً|no|n)$/i.test(String(t || '').trim()); }
  function studyIntroMsg() {
    return W(' دراسة المحاكاة الشمسية (PVsyst)\n' + SEP +
      '\nتتضمن الدراسة تقريراً فنياً متكاملاً عن أداء المنظومة، ويشمل:\n' +
      '\nالإنتاج الشهري والسنوي للطاقة\nنسبة الأداء PR ونسبة الاعتماد على الطاقة الشمسية SF\nبيانات الموقع والإشعاع الشمسي والظروف المناخية\nمواصفات الألواح والانفرتر والبطاريات\nالخسائر الكهربائية والحرارية وخسائر النظام والتخزين\nالنتائج والموازنات الشهرية\nمخطط الخسائر\nمخطط الإدخال والإخراج اليومي\nمخطط توازن الطاقة الشهري\n' +
      SEP);
  }
  function studyAskMsg() {
    return W(' دراسة المحاكاة الشمسية (PVsyst)*\n' + SEP +
      '\nهل ترغب بإنجاز دراسة محاكاة PVsyst لمنظومتك؟\n' +
      '\n تقرير فني كامل: الإنتاج الشهري والسنوي\n نسبة الأداء ومعامل الأداء PR\n جداول ومخططات جاهزة للاعتماد\n' +
      SEP + '\nاختر من الأزرار بالأسفل: نعم لإنجاز الدراسة، أو متابعة الشراء لإتمام الطلب مباشرة.\n\nأرسل 0 للعودة للبداية._');
  }
  function sldAskMsg() {
    return W(' مخطط SLD (Single Line Diagram)*\n' + SEP +
      '\nهل ترغب بإنشاء مخطط SLD لمنظومتك؟\n' +
      '\n ملف PDF جاهز للطباعة والاعتماد\n يشمل الألواح والسلاسل وصندوق DC والإنفرتر والبطاريات ولوحة AC ومقاسات الكابلات والقواطع\n' +
      SEP + '\nاختر نعم أو لا._');
  }
  function buyAskMsg() {
    return W(' متابعة الشراء\n' + SEP +
      '\nخطوات إتمام الشراء:_\n' +
      '\n1 - تأكيد الطلب وتحديد موقع التسليم\n2 - اختيار طريقة الدفع (حوالة شبكة محلية • محفظة إلكترونية • الدفع عند الاستلام)\n3 - إصدار فاتورة الشراء\n4 - التجهيز والتسليم والتركيب\n' +
      SEP + '\nاضغط متابعة الشراء للبدء._\nأرسل 0 للعودة إلى البداية._');
  }
  function buyLocationAsk() {
    return locGovAsk(' حدد موقعك\nيرجى اختيار المحافظة من القائمة التالية._');
  }
  function cityKnown() { return !!(city && String(city).indexOf('|') < 0 && String(city).indexOf('PG:') !== 0); }
  // لا نطلب الموقع مرتين في نفس المسار: إن كان الموقع معروفاً من خطوة سابقة ننتقل لطريقة الدفع مباشرة
  function goBuy() {
    if (cityKnown()) { step = 'pay_method'; return payMethodAsk(); }
    city = ''; step = 'buy_location_gov'; return buyLocationAsk();
  }
  function payMethodAsk() {
    return W(' اتمام الشراء\n' + SEP +
      '\nنشكرك على ثقتك بشركة أكتس لأنظمة الطاقة وحلولها._\n' +
      SEP +
      '\nخيارات الدفع\n1 - التحويل عبر شركة محلية\n2 - التحويل عبر محافظ إلكترونية\n3 - الدفع عند الاستلام');
  }
  function salesContacts() {
    return 'اتصال بمندوب المبيعات\n780480143\n780480145\n785588300';
  }
  function payNetworkAsk() {
    return W(' حوالات الشبكات المحلية\n' + SEP + '\nاكتب اسم الشبكة التي ستحوّل من خلالها\nمثال: النجم العمقي');
  }
  function payWalletAsk() {
    return W(' المحافظ الإلكترونية\n' + SEP + '\nاكتب اسم المحفظة التي ستحوّل من خلالها\nمثال: جيب');
  }
  function buyDoneMsg(payLabel) {
    return W(' اتمام الشراء\n' + SEP +
      '\nنشكرك على ثقتك بشركة أكتس لأنظمة الطاقة وحلولها._\n' + SEP +
      '\n الموقع : ' + (city || '-') + '\n طريقة الدفع : ' + payLabel + '\n' + SEP +
      '\nتم استلام طلبك بنجاح، وسيتم التواصل معك خلال لحظات من إدارة المبيعات لإتمام التفاصيل._');
  }
  function payNotifShort(payLabel) {
    var lqs = lastQuote();
    var tss = now.replace('T', ' ').substring(0, 16) + ' UTC';
    return ' إشعار تحويل جديد\n' + SEP +
      '\nالعميل: ' + (customer_name || session.customer_name || '-') +
      '\nالهاتف: ' + phone +
      '\nالموقع: ' + (city || '-') +
      (lqs.num ? ('\nرقم الفاتورة: ' + lqs.num) : '') +
      (lqs.total ? ('\nالمبلغ: ' + money(lqs.total) + ' $') : '') +
      '\nطريقة الدفع: ' + payLabel +
      '\nالوقت: ' + tss;
  }
  function notifBuy(payLabel) {
    var tsb = now.replace('T', ' ').substring(0, 16) + ' UTC';
    return AC + ' — طلب فاتورة شراء\n' + SEP + '\nالعميل: ' + (customer_name || '-') +
      '\nالموقع: ' + (city || '-') + '\nطريقة الدفع: ' + payLabel +
      (quote_number ? '\nرقم العرض: ' + quote_number : '') +
      '\nالهاتف: ' + phone + '\nالوقت: ' + tsb +
      '\n' + SEP + '\nالمبيعات | الصندوق | الحسابات' +
      '\nنسخة للمبيعات نسخة للصندوق';
  }

  // ===================== إصدار عرض السعر =====================
  function finalizeQuote() {
    step = 'done';
      if (menu_choice === '2') {
        notify_employee = true;
        notification_text = notifCom(customer_name, activity_type.replace('com_', ''), monthly_consumption, parseFloat(peak_load) || 0, night_hours, system_type, false);
        var _mq2 = comIssueMultiQuote(customer_name);
        if (_mq2 === 'ok') {
          step = 'qnext_ask';
          followup_kind = 'qnext';
        } else if (_mq2 === 'escalate') {
          step = 'done';
        } else if (load_type && COM_QUOTES[load_type]) {
          response = comQuoteText(load_type, customer_name, system_type);
          send_quote_file = true;
          item_quote = true;
          quote_items = stripBaseItems(comQuoteItems(load_type));
          quote_number = COM_QUOTES[load_type].num;
          quote_file_url = COM_QUOTES[load_type].url;
          quote_file_name = 'عرض سعر ' + COM_QUOTES[load_type].num + '.pdf';
          quote_caption = quoteAfterPdf(quote_items);
          step = 'qnext_ask';
          followup_kind = 'qnext';
        } else {
          response = m('contact_ok');
        }
      } else {
      var _rsel = (menu_choice === '1' && system_type && RES_BY_CODE[system_type]) ? { code: system_type, name: RES_BY_CODE[system_type].name } : null;
      var qlkN = _rsel || lookupByBill(parseFloat(monthly_consumption), menu_choice);
      if (qlkN) {
        notify_employee = true;
        notification_text = notifQuote(customer_name, monthly_consumption, qlkN.name, menu_choice, false);
        response = quoteText(qlkN.code, customer_name, qlkN.name);
        send_quote_file = true;
        item_quote = true;
        quote_items = stripBaseItems(resQuoteItems(qlkN.code));
        quote_number = RES_QUOTE_NUM[qlkN.code] || '';
        quote_file_url = PDF_FILES[qlkN.code] || '';
        quote_file_name = 'عرض سعر - ' + qlkN.name + '.pdf';
        quote_caption = quoteAfterPdf(quote_items);
        if (menu_choice === '1') { step = 'buy_ask'; followup_kind = 'buy'; } else { step = 'qnext_ask'; followup_kind = 'qnext'; }
      } else {
        notify_employee = true;
        notification_text = notifQuote(customer_name, monthly_consumption, '', menu_choice, true);
        response = outOfRange();
      }
      }
  }

  function askNameMsg() {
    return m('ask_name');
  }
  function planPickMsg() {
    return W(' الدراسة الفنية والمخطط\n' + SEP + '\nاختر الخدمة المطلوبة من الأزرار التالية:_');
  }

  // ===================== واجهة الأزرار التفاعلية =====================
  var MENU_BTNS_AR = [
    { id: '1', title: 'السكني والتجاري والصناعي' },
    { id: '2', title: 'عبر دراسة PVsyst' }
  ];
  var SUB_SYS3_AR = [
    { id: '1', title: 'السكني' },
    { id: '2', title: 'التجاري' },
    { id: '3', title: 'الصناعي — قريباً' }
  ];
  var SUB_RES_COM_AR = [
    { id: '1', title: 'النظام السكني' },
    { id: '2', title: 'النظام التجاري' }
  ];
  var SUB_IND_AGR_AR = [
    { id: '1', title: 'النظام الصناعي' },
    { id: '2', title: 'النظام الزراعي' }
  ];
  var MENU_BTNS_EN = [
    { id: '1', title: 'Res / Com / Ind' },
    { id: '2', title: 'Via PVsyst Study' }
  ];
  var SUB_SYS3_EN = [
    { id: '1', title: 'Residential' },
    { id: '2', title: 'Commercial' },
    { id: '3', title: 'Industrial — Coming soon' }
  ];
  var SUB_RES_COM_EN = [
    { id: '1', title: 'Residential System' },
    { id: '2', title: 'Commercial System' }
  ];
  var SUB_IND_AGR_EN = [
    { id: '1', title: 'Industrial System' },
    { id: '2', title: 'Agricultural System' }
  ];
  var BTN_BACK_AR = { id: '0', title: 'العودة للبداية' };
  var BTN_BACK_STEP = { id: 'back_step', title: 'العودة خطوة' };
  var BTN_BACK_EN = { id: '0', title: 'Back to Start' };

  function isEn() { return lang === 'en'; }
  function backBtn() { return isEn() ? BTN_BACK_EN : BTN_BACK_AR; }
  function backStepBtn() { return isEn() ? { id: 'back_step', title: 'Back one step' } : BTN_BACK_STEP; }

  function customerNameSteps(st) {
    return ['quote_name', 'com_quote_name', 'pv_quote_name', 'sup_name', 'con_name', 'item_name'].indexOf(String(st || '')) >= 0;
  }
  function lastConsumptionKwh() {
    var raw = String(project_type || session.project_type || '');
    var m = raw.match(/(?:^|\|)LC=([0-9]+(?:\.[0-9]+)?)/);
    if (m) { var v = parseFloat(m[1]); if (isFinite(v) && v > 0) { return v; } }
    // Backward-compatible recovery when the saved session was last on consumption method.
    var at = String(session.activity_type || '');
    if (/^(?:res|com)_2$/.test(at)) {
      var mc = parseFloat(String(session.monthly_consumption || '').replace(/,/g, ''));
      if (isFinite(mc) && mc > 0) {
        var k = at.indexOf('res_') === 0 ? (mc / KWH_PRICE) : mc;
        if (isFinite(k) && k > 0) { return Math.round(k * 100) / 100; }
      }
    }
    return 0;
  }
  function lastConsumptionButton() {
    var k = lastConsumptionKwh();
    if (!k) { return null; }
    var label = String(Math.round(k * 100) / 100);
    return { id: 'use_last_consumption', title: label + ' كيلووات' };
  }

  function lastNameButton() {
    var nm = String(customer_name || session.customer_name || '').trim();
    if (!nm) { return null; }
    return { id: 'use_last_name', title: 'الاسم السابق: ' + truncate(nm, 10) };
  }

  function uiForStepBase(st) {
    var en = isEn();
    if (st === 'welcome_services') {
      return { kind: 'buttons', buttons: [
        { id: 'quote_start', title: 'طلب عرض سعر' },
        { id: 'renewable_solutions', title: 'حلول أنظمة الطاقة' },
        { id: 'aftersales_support', title: 'الدعم الفني' }
      ] };
    }
    if (st === 'energy_menu') {
      return { kind: 'buttons', buttons: [
        { id: 'pv_study', title: 'دراسة PVsyst' },
        { id: 'team', title: 'فريق أكتس' }
      ] };
    }
    if (st === 'quote_menu') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'سكني / تجاري / صناعي' }
      ] };
    }
    if (st === 'main_menu') {
      return { kind: 'buttons', buttons: en ? MENU_BTNS_EN : MENU_BTNS_AR };
    }
    if (st === 'menu_res_com') {
      return { kind: 'buttons', buttons: en ? SUB_RES_COM_EN : SUB_RES_COM_AR };
    }
    if (st === 'menu_ind_agr') {
      return { kind: 'buttons', buttons: en ? SUB_IND_AGR_EN : SUB_IND_AGR_AR };
    }
    if (st === 'menu_sys3') {
      return { kind: 'buttons', buttons: en ? SUB_SYS3_EN : SUB_SYS3_AR };
    }
    if (st === 'pv_sysmode') {
      return { kind: 'buttons', buttons: [
        { id: 'sys_on', title: 'On Grid' },
        { id: 'sys_off', title: 'Off Grid' },
        { id: 'sys_hyb', title: 'Hybrid' }
      ] };
    }
    if (st === 'pv_study_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'study_yes', title: 'نعم' },
        { id: 'study_no', title: 'لا' }
      ] };
    }
    if (st === 'pv_sld_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'sld_yes', title: 'نعم' },
        { id: 'sld_no', title: 'لا' }
      ] };
    }
    if (st === 'pv_quote_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'pv_q_yes', title: 'نعم' },
        { id: 'pv_q_no', title: 'لا' }
      ] };
    }
    if (st === 'ind_activity') {
      return { kind: 'list', button: 'اختر نوع النشاط', sections: [ { title: 'النشاط الصناعي', rows: [
        { id: 'ind_act_1', title: 'صناعات غذائية' },
        { id: 'ind_act_2', title: 'بلاستيك وتعبئة' },
        { id: 'ind_act_3', title: 'معادن وورش' },
        { id: 'ind_act_4', title: 'نسيج وملابس' },
        { id: 'ind_act_5', title: 'مواد بناء وخرسانة' },
        { id: 'ind_act_6', title: 'تبريد وتجميد' },
        { id: 'ind_act_7', title: 'أخرى' }
      ] } ] };
    }
    if (st === 'ind_shifts') {
      return { kind: 'buttons', buttons: [
        { id: 'shifts_1', title: 'وردية واحدة' },
        { id: 'shifts_2', title: 'ورديتان' },
        { id: 'shifts_3', title: 'ثلاث ورديات' }
      ] };
    }
    if (st === 'ind_load_src') {
      return { kind: 'buttons', buttons: [
        { id: 'loads_1', title: 'جدول Excel / PDF' },
        { id: 'loads_2', title: 'صورة اللوحات' },
        { id: 'loads_3', title: 'إدخال يدوي' }
      ] };
    }
    if (st === 'ind_load_file') {
      return { kind: 'buttons', buttons: [ { id: 'skip', title: 'تخطي' }, backBtn() ] };
    }
    if (st === 'ind_motors') {
      return { kind: 'buttons', buttons: [
        { id: 'motors_yes', title: 'نعم' },
        { id: 'motors_no', title: 'لا' }
      ] };
    }
    if (st === 'ind_source') {
      return { kind: 'list', button: 'اختر المصدر', sections: [ { title: 'مصدر الكهرباء الحالي', rows: [
        { id: 'src_1', title: 'مولد فقط' },
        { id: 'src_2', title: 'شبكة + مولد' },
        { id: 'src_3', title: 'شبكة فقط' },
        { id: 'src_4', title: 'يوجد نظام شمسي' }
      ] } ] };
    }
    if (st === 'ind_goal') {
      return { kind: 'buttons', buttons: [
        { id: 'goal_1', title: 'تقليل الديزل' },
        { id: 'goal_2', title: 'نظام كامل 24 ساعة' },
        { id: 'goal_3', title: 'ربط بالشبكة' }
      ] };
    }
    if (st === 'ind_result') {
      return { kind: 'buttons', buttons: [
        { id: 'ind_quote', title: 'عرض السعر' },
        { id: 'ind_study', title: 'دراسة PVsyst' },
        { id: 'ind_sld', title: 'مخطط SLD' }
      ] };
    }
    if (st === 'ind_gen_kva' || st === 'ind_diesel') {
      return { kind: 'buttons', buttons: [ { id: 'unknown', title: 'لا أعرف' }, backBtn() ] };
    }
    if (st === 'ind_name' || st === 'ind_shift' || st === 'ind_total_kw' || st === 'ind_max_mach' || st === 'ind_motor_kw' || st === 'ind_old_pv') {
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }
    if (customerNameSteps(st)) {
      var _lnb = lastNameButton(), _nbs = [];
      if (_lnb) { _nbs.push(_lnb); }
      _nbs.push(backBtn());
      return { kind: 'buttons', buttons: _nbs };
    }
    if (st === 'pv_loads') { return null; }
    if (st === 'pv_site' || st === 'pv_quote_name') {
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }
    if (st === 'item_menu') {
      return { kind: 'list', button: 'اختر نوع الصنف', sections: [ { title: 'أنواع الأصناف', rows: [
        { id: '1', title: 'ألواح شمسية' },
        { id: '2', title: 'انفرترات' },
        { id: '3', title: 'بطاريات' },
        { id: '4', title: 'كابلات ولوحات' },
        { id: '0', title: 'العودة إلى البداية' }
      ] } ] };
    }
    if (st === 'item_name') {
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }
    if (st === 'item_pick' || st === 'item_qty' || st === 'item_cart') {
      return null;
    }
    if (st === 'item_next') {
      return { kind: 'buttons', buttons: [
        { id: 'item_go_pv', title: 'ألواح شمسية' },
        { id: 'item_go_acc', title: 'لوحات وكابلات' },
        { id: 'item_go_quote', title: 'طلب عرض سعر' }
      ] };
    }
    if (st === 'item_pv_type') {
      return { kind: 'buttons', buttons: [
        { id: 'pv1', title: 'لوح 595 وات' },
        { id: 'pv2', title: 'لوح 720 وات' },
        backBtn()
      ] };
    }
    if (st === 'item_ib_kind') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'انفرتر' },
        { id: '2', title: 'بطارية' },
        backBtn()
      ] };
    }
    if (st === 'item_inv_type') {
      return { kind: 'buttons', buttons: [
        { id: 'inv1', title: 'ليو باور 1.6 كيلو' },
        { id: 'inv2', title: 'ليو باور 6.2 كيلو' },
        { id: 'inv3', title: 'دايا 8 كيلو' }
      ] };
    }
    if (st === 'item_bat_type') {
      return { kind: 'buttons', buttons: [
        { id: 'bat2', title: 'بايلونتك 2.56 كيلو' },
        { id: 'bat3', title: 'هيثيوم 4 كيلو' },
        { id: 'bat4', title: 'بايلونتك 5.12 كيلو' }
      ] };
    }
    if (st === 'item_bc_kind') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'كابل' },
        { id: '2', title: 'لوحة DC' },
        { id: '3', title: 'لوحة AC' }
      ] };
    }
    if (st === 'item_cable_type') {
      return { kind: 'buttons', buttons: [
        { id: 'cb1', title: 'مفرد 6 مم' },
        { id: 'cb2', title: 'مفرد 4 مم' },
        backBtn()
      ] };
    }
    if (st === 'item_pv_qty' || st === 'item_inv_qty' || st === 'item_bat_qty' || st === 'item_cable_len' || st === 'item_board_amp' || st === 'item_board_qty') {
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }
    if (st === 'res_bill') {
      return { kind: 'buttons', buttons: [
        { id: 'browse', title: 'المنظومات الجاهزة' }
      ] };
    }
    // المنظومات السكنية الجاهزة: قائمة واحدة فعلية، وليست أزرار رجوع فقط
    if (st === 'res_browse_inv') {
      var invRowsRes = [];
      for (var rci = 0; rci < RES_INV_CLASSES.length; rci++) {
        var rcl = resListOfClass(RES_INV_CLASSES[rci].kw);
        invRowsRes.push({
          id: RES_INV_CLASSES[rci].id,
          title: 'انفرتر ' + RES_INV_CLASSES[rci].kw + ' كيلو',
          description: rcl.length + ' منظومات سكنية جاهزة'
        });
      }
      // التنقل داخل نفس القائمة حتى يبقى أمام العميل زر قائمة واحد فقط
      invRowsRes.push({ id: 'back_step', title: 'العودة خطوة' });
      invRowsRes.push({ id: '0', title: 'العودة للبداية' });
      return { kind: 'list', button: 'اختر من القائمة', sections: [
        { title: 'قدرة الانفرتر', rows: invRowsRes }
      ] };
    }
    if (st === 'res_browse') {
      var sysRowsRes = [], selKwRes = resInvSel(), sysListRes = resListOfClass(selKwRes);
      for (var rsi = 0; rsi < sysListRes.length; rsi++) {
        var rrRes = sysListRes[rsi];
        sysRowsRes.push({
          id: 'sys_' + rrRes.code,
          title: resOptionTitle(rrRes),
          description: resOptionDescription(rrRes)
        });
      }
      sysRowsRes.push({ id: 'back_step', title: 'العودة خطوة' });
      sysRowsRes.push({ id: '0', title: 'العودة للبداية' });
      return { kind: 'list', button: 'اختر من القائمة', sections: [
        { title: 'المنظومات السكنية الجاهزة', rows: sysRowsRes }
      ] };
    }
    if (st === 'res_value') {
      if (String(res_method || '') === '2') {
        var rlb = lastConsumptionButton();
        var rb = [];
        if (rlb) { rb.push(rlb); }
        rb.push(backStepBtn());
        rb.push(backBtn());
        return { kind: 'buttons', buttons: rb.slice(0, 3) };
      }
      return { kind: 'buttons', buttons: [ backStepBtn() ] };
    }
    if (st === 'com_value') {
      if (String(activity_type || '') === 'com_2') {
        var clb = lastConsumptionButton();
        var cb = [];
        if (clb) { cb.push(clb); }
        cb.push(backStepBtn());
        cb.push(backBtn());
        return { kind: 'buttons', buttons: cb.slice(0, 3) };
      }
      return { kind: 'buttons', buttons: [ backStepBtn() ] };
    }

    if (st === 'res_browse') {
      var brows = [];
      var rkwSel = resInvSel();
      var rlistSel = resListOfClass(rkwSel);
      for (var bri = 0; bri < rlistSel.length; bri++) {
        var rr = rlistSel[bri];
        brows.push({
          id: 'sys_' + rr.code,
          title: resOptionTitle(rr),
          description: 'السعر: ' + money(resTotalOf(rr.code)) + ' $'
        });
      }
      brows.push({ id: 'back_step', title: 'العودة خطوة' });
      return { kind: 'list', button: 'اختر المنظومة', sections: [
        { title: 'منظومات ' + (rkwSel === null ? '' : rkwSel) + ' كيلو', rows: brows }
      ] };
    }
    if (st === 'res_tie') {
      var tls = resTieList(), trows = [];
      for (var tii = 0; tii < tls.length; tii++) {
        trows.push({ id: 'restie_' + tls[tii].code, title: resOptionTitle(tls[tii]), description: resOptionDescription(tls[tii]) });
      }
      if (!trows.length) { trows.push({ id: 'browse', title: 'تصفح المنظومات الجاهزة' }); }
      return { kind: 'list', button: 'اختر المنظومة', sections: [ { title: 'المنظومات المناسبة', rows: trows } ] };
    }
    if (st === 'buy_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'buy_invoice', title: 'متابعة الشراء' },
        { id: 'sales_contact', title: 'التواصل مع المبيعات' },
        backBtn()
      ] };
    }
    if (st === 'study_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'study_yes', title: 'نعم' },
        { id: 'buy_invoice', title: 'متابعة الشراء' },
        { id: 'sales_contact', title: 'التواصل مع المبيعات' }
      ] };
    }
    if (st === 'sld_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'sld_yes', title: 'نعم' },
        { id: 'sld_no', title: 'لا' }
      ] };
    }
    if (st === 'study_city' || st === 'study_city_sld') {
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }
    if (st === 'pay_method') {
      return { kind: 'buttons', buttons: [
        { id: 'pay_network', title: 'حوالة شبكة محلية' },
        { id: 'pay_wallet', title: 'محفظة إلكترونية' },
        { id: 'pay_cod', title: 'الدفع عند الاستلام' }
      ] };
    }
    if (st === 'buy_location' || st === 'pay_network' || st === 'pay_network_name' || st === 'pay_wallet' || st === 'pay_wallet_name' || st === 'pay_notice') {
      return { kind: 'buttons', buttons: [ backStepBtn() ] };
    }
    if (/_gov$/.test(st) && LOC_BASE[st.slice(0, -4)]) {
      if (String(city || '') === '__OTHER_GOV_LIST__') { return locGovOtherAsk(st === 'study_city_gov'); }
      if (st === 'study_city_gov') {
        return { kind: 'buttons', buttons: [
          { id: 'gov_sanaa', title: 'صنعاء' },
          { id: 'gov_aden', title: 'عدن' },
          { id: 'gov_other', title: 'محافظة أخرى' }
        ] };
      }
      return { kind: 'buttons', buttons: [
        { id: 'gov_sanaa', title: 'صنعاء (أمانة العاصمة)' },
        { id: 'gov_aden', title: 'عدن' },
        { id: 'gov_other', title: 'محافظة أخرى' }
      ] };
    }
    if (/_dist$/.test(st) && LOC_BASE[st.slice(0, -5)]) {
      var gi5 = parseInt(String(city).split('|')[0], 10);
      var g5 = (gi5 >= 1 && gi5 <= GOVS.length) ? GOVS[gi5 - 1] : null;
      if (g5) {
        var tpD = locPages(g5.d.length), pgD = distPage(g5.d.length);
        var startD = (pgD - 1) * LOC_PAGE_SIZE, endD = Math.min(startD + LOC_PAGE_SIZE, g5.d.length);
        var rowsD = [];
        for (var di4 = startD; di4 < endD; di4++) { rowsD.push({ id: String(di4 + 1), title: g5.d[di4] }); }
        if (tpD > 1) { rowsD.push({ id: 'loc_more', title: 'عرض المزيد ⏭' }); }
        rowsD.push({ id: 'loc_back_gov', title: 'تغيير المحافظة ⏮' });
        return { kind: 'list', locList: true, button: 'اختر الموقع', sections: [ { title: g5.n + ' ▸ ' + (startD + 1) + '-' + endD, rows: rowsD } ] };
      }
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }

    if (st === 'com_visit_ask') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'طلب عرض سعر رسمي' },
        { id: '2', title: 'موعد زيارة ميدانية' },
        backStepBtn()
      ] };
    }
    if (st === 'com_inv_ask') {
      var io = comInvOptions();
      // تجاري فقط: حتى 3 اختيارات = أزرار مباشرة، 4+ = قائمة.
      // خيار واحد لا يصل إلى هذه الخطوة أصلاً؛ يُعتمد تلقائياً في منطق الحالة.
      if (!io.length) { return { kind: 'buttons', buttons: [ backStepBtn() ] }; }
      if (io.length <= 3) {
        var ibtns = [];
        for (var ib = 0; ib < io.length; ib++) {
          ibtns.push({ id: 'invkw_' + io[ib].kw, title: 'انفرتر ' + io[ib].kw + ' كيلو' });
        }
        return { kind: 'buttons', buttons: ibtns };
      }
      var irows = [];
      for (var ioi = 0; ioi < io.length; ioi++) {
        irows.push({ id: 'invkw_' + io[ioi].kw, title: 'انفرتر ' + io[ioi].kw + ' كيلو', description: 'تغطية حتى ' + Math.round(io[ioi].maxDaily) + ' كيلووات/يوم' });
      }
      irows.push({ id: 'back_step', title: 'العودة خطوة' });
      return { kind: 'list', button: 'اختر قدرة الانفرتر', sections: [ { title: 'قدرات الانفرترات', rows: irows } ] };
    }
    if (st === 'com_phase_ask') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'Single Phase (1 فاز)' },
        { id: '2', title: 'Three Phase (3 فاز)' },
        backStepBtn()
      ] };
    }
    if (st === 'com_method') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'فاتورة كهرباء (ريال)' },
        { id: '2', title: 'استهلاك (كيلووات)' },
        { id: '3', title: 'ديزل (لتر)' }
      ] };
    }
    if (st === 'res_quote_ask') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: 'طلب عرض رسمي' },
        backStepBtn()
      ] };
    }
    if (st === 'agr_quote_ask' || st === 'com_quote_ask' || st === 'qnext_ask') {
      return { kind: 'buttons', buttons: [
        { id: 'aq_buy', title: 'متابعة الشراء' },
        { id: 'aq_plan', title: 'PVsyst / SLD' },
        backStepBtn()
      ] };
    }
    if (st === 'plan_pick') {
      return { kind: 'buttons', buttons: [
        { id: 'aq_study', title: 'دراسة PVsyst' },
        { id: 'aq_sld', title: 'مخطط SLD' },
        backStepBtn()
      ] };
    }
    if (st === 'ind_quote_ask') {
      return { kind: 'buttons', buttons: [
        { id: '1', title: en ? 'Get a quote' : 'طلب عرض سعر' },
        backStepBtn()
      ] };
    }
    // زر "العودة للبداية" يظهر فقط من بعد عرض المنظومة وما بعدها
    if (st === 'com_visit_date' || st === 'com_visit_facility' || st === 'com_visit_location' || st === 'quote_name' || st === 'com_quote_name') {
      return { kind: 'buttons', buttons: [ backStepBtn() ] };
    }
    // أي رسالة نهائية يجب أن تحمل زر العودة للبداية حتى لا تكون نهاية مسدودة
    if (st === 'done') {
      return { kind: 'buttons', buttons: [ backBtn() ] };
    }
    return null;
  }

  // كل خطوة يجب أن تحتوي زر العودة خطوة واحدة
  function hasBackStep(list) {
    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === 'back_step') { return true; } }
    return false;
  }
  function uiForStep(st) {
    st = String(st || '');
    var ui = uiForStepBase(st);
    if (st === 'done' || st === 'welcome_services' || st === 'start') { return ui; }
    if (!ui) { return { kind: 'buttons', buttons: [ backStepBtn(), backBtn() ] }; }
    if (ui.kind === 'buttons') {
      if (hasBackStep(ui.buttons)) { return { kind: 'buttons', buttons: ui.buttons.slice(0, 3) }; }
      if (ui.buttons.length < 3) { return { kind: 'buttons', buttons: ui.buttons.concat([ backStepBtn() ]) }; }
      return { kind: 'buttons', buttons: ui.buttons.slice(0, 3) };
    }
    if (ui.kind === 'list' && (st === 'res_browse_inv' || st === 'res_browse' || st === 'res_tie')) { return ui; }
    if (ui.locList) {
      var found = false, s3;
      for (s3 = 0; s3 < ui.sections.length; s3++) { if (hasBackStep(ui.sections[s3].rows)) { found = true; } }
      if (!found) {
        var last = ui.sections[ui.sections.length - 1];
        if (last.rows.length >= 10) { last.rows = last.rows.slice(0, 9); }
        last.rows.push({ id: 'back_step', title: 'العودة خطوة' });
      }
      return ui;
    }
    var rws = [], a, b;
    for (a = 0; a < ui.sections.length; a++) {
      for (b = 0; b < ui.sections[a].rows.length; b++) {
        if (String(ui.sections[a].rows[b].id) !== 'back_step') { rws.push(ui.sections[a].rows[b]); }
      }
    }
    return { kind: 'list', button: ui.button, sections: [ { title: (ui.sections[0] && ui.sections[0].title) || '', rows: rws } ] };
  }

  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.substring(0, n - 1) + '…' : s; }

  function __hasBackHint(t) { return String(t).indexOf('00') >= 0 && /00/.test(String(t)); }
  function __addBackHint(t) {
    if (/\u0623\u0631\u0633\u0644\s*00/.test(String(t))) { return t; }
    return String(t) + '\n\n' + 'أرسل 00 للعودة خطوة';
  }
  function __hasNumbered(t) { return /(^|\n)\s*\d+\s*(?:-|\u2014|\u2013|\.|\))/.test(String(t)); }

  function buildPayload(bodyText, st) {
    var base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone };
    var ui = uiForStep(st);
    bodyText = String(bodyText == null ? '' : bodyText);
    if (!bodyText) { bodyText = '\u2014'; }
    if (!ui || bodyText.length > 1020) {
      return Object.assign(base, { type: 'text', text: { preview_url: false, body: bodyText.substring(0, 4000) } });
    }
    var hdrLink = INV_HDR_URL || headerImageForStep(st) || (st === 'welcome_services' ? WELCOME_IMAGE_URL : OTHER_MESSAGES_IMAGE_URL);

    if (ui.kind === 'buttons') {
      var btns = [], b;
      for (b = 0; b < ui.buttons.length && b < 3; b++) {
        btns.push({ type: 'reply', reply: { id: ui.buttons[b].id, title: truncate(ui.buttons[b].title, 20) } });
      }
      if (!hasBackStep(ui.buttons) && st !== 'welcome_services' && st !== 'start' && st !== 'done') {
        bodyText = __addBackHint(bodyText);
      }
      if (bodyText.length > 1020) {
        return Object.assign(base, { type: 'text', text: { preview_url: false, body: bodyText.substring(0, 4000) } });
      }
      return Object.assign(base, { type: 'interactive', interactive: {
        type: 'button',
        header: { type: 'image', image: { link: hdrLink } },
        body: { text: bodyText },
        action: { buttons: btns }
      } });
    }

    // \u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0645\u062d\u0641\u0648\u0632\u0629 \u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0645\u0648\u0642\u0639 \u0641\u0642\u0637
    if (ui.kind === 'list' || ui.locList) {
      var secs = [], s2, r;
      for (s2 = 0; s2 < ui.sections.length; s2++) {
        var sec = ui.sections[s2], rws = [];
        for (r = 0; r < sec.rows.length && r < 10; r++) {
          var row = { id: sec.rows[r].id, title: truncate(sec.rows[r].title, 24) };
          if (sec.rows[r].description) { row.description = truncate(sec.rows[r].description, 72); }
          rws.push(row);
        }
        if (rws.length) { secs.push({ title: truncate(sec.title || 'الخيارات', 24), rows: rws }); }
      }
      if (!secs.length) {
        return Object.assign(base, { type: 'text', text: { preview_url: false, body: bodyText.substring(0, 4000) } });
      }
      var _listInteractive = {
        type: 'list',
        body: { text: bodyText },
        action: { button: truncate(ui.button || 'اختر من القائمة', 20), sections: secs }
      };
      if (String(bodyText).indexOf('أكتس لأنظمة الطاقة وحلولها') < 0) {
        _listInteractive.header = { type: 'text', text: truncate('أكتس لأنظمة الطاقة وحلولها', 60) };
      }
      return Object.assign(base, { type: 'interactive', interactive: _listInteractive });
    }

    var flatRows = __flatRows(ui);
    if (!flatRows.length) {
      return Object.assign(base, { type: 'text', text: { preview_url: false, body: bodyText.substring(0, 4000) } });
    }
    var body = bodyText;
    if (flatRows.length > 3 && !__hasNumbered(body)) {
      var lines = '', k;
      for (k = 0; k < flatRows.length; k++) { lines += '\n' + (k + 1) + ' - ' + flatRows[k].title; }
      body += '\n' + lines;
    }
    if (st !== 'welcome_services' && st !== 'start' && st !== 'done') { body = __addBackHint(body); }
    var rbtns = [], m2;
    for (m2 = 0; m2 < flatRows.length && m2 < 3; m2++) {
      rbtns.push({ type: 'reply', reply: { id: flatRows[m2].id, title: truncate(flatRows[m2].title, 20) } });
    }
    if (body.length > 1020) {
      return Object.assign(base, { type: 'text', text: { preview_url: false, body: body.substring(0, 4000) } });
    }
    return Object.assign(base, { type: 'interactive', interactive: {
      type: 'button',
      header: { type: 'image', image: { link: hdrLink } },
      body: { text: body },
      action: { buttons: rbtns }
    } });
  }

  // نص طويل + خطوة فيها أزرار => نرسل التفاصيل كرسالة نصية أولاً ثم رسالة الأزرار
  var pre_text = '';
  var pre_payload = null;
  var wa_payload = null;
  if (study_intro_pending) { pre_text = studyIntroMsg(); }
  var __ui = uiForStep(step);

  // ===================== صور الانفرترات (تظهر في رأس تفاصيل المنظومة) =====================
  var INV_IMG_BASE = 'https://project--96721c96-71db-44e0-a677-0b829af67f4f-dev.lovable.app/__l5e/assets-v1/';
  var INV_IMG_FILES = {
    'lipower16': '72e37106-826c-4523-b69c-dcd0dc6e1b15/lipower-1.6kw-12v.jpg',
    'lipower62': 'be18ccaa-890f-4bbe-b7a4-aa073bbbf363/lipower-6.2kw-48v.jpg',
    'deye8': 'a3de52ca-a2fc-4331-b783-ee2362ee0ff4/deye-8kw-1ph.jpg',
    'deye12': '3eba5a99-6e86-4956-94da-d98cf710dc42/deye-12kw-1ph.jpg',
    'deye16': 'fc51f36a-57dc-4830-9565-84742df6ba10/deye-16kw-1ph.jpg',
    'deye12t': '19e9be3f-a3cc-4ac2-8187-ece6f6cdeeb2/deye-12kw-3ph.png',
    'deye16t': 'd33bf508-b074-4767-af0f-b178fc426dfb/deye-16kw-3ph.jpg',
    'deye20t': '3284c033-3aad-4f2f-87f4-2edbf0601246/deye-20kw-3ph.jpg',
    'deye50t': '9cb4721e-423c-40d9-bc39-f109324c44b2/deye-50kw-3ph.jpg',
    'deye80t': '9b624670-b59c-4fd8-ba2c-245ebae1366c/deye-80kw-3ph.jpg',
    'solis50': '9289ddc6-2b93-4edd-9c8f-071b61ab7a8e/solis-50kw-3ph.jpg',
    'solis125': 'e2752967-3b13-4cc2-bd1f-cac68ba78ce8/solis-125kw-3ph.jpg'
  };
  // ===================== صور الأصناف (كل صنف وصورته) =====================
  var ASSET_BASE = 'https://project--96721c96-71db-44e0-a677-0b829af67f4f-dev.lovable.app';
  var ITEM_IMG = {
    'panel:595': '/__l5e/assets-v1/e40874fa-4d2c-4b22-94b0-aedb2ca8519d/suntech-595w.jpg',
    'panel:720': '/__l5e/assets-v1/5d37b02a-a83d-4081-a27c-87f7fb87a21c/suntech-720w.jpg',
    'inverter:1.6:1': '/__l5e/assets-v1/72e37106-826c-4523-b69c-dcd0dc6e1b15/lipower-1.6kw-12v.jpg',
    'inverter:6.2:1': '/__l5e/assets-v1/be18ccaa-890f-4bbe-b7a4-aa073bbbf363/lipower-6.2kw-48v.jpg',
    'inverter:8:1': '/__l5e/assets-v1/a3de52ca-a2fc-4331-b783-ee2362ee0ff4/deye-8kw-1ph.jpg',
    'inverter:12:1': '/__l5e/assets-v1/3eba5a99-6e86-4956-94da-d98cf710dc42/deye-12kw-1ph.jpg',
    'inverter:16:1': '/__l5e/assets-v1/fc51f36a-57dc-4830-9565-84742df6ba10/deye-16kw-1ph.jpg',
    'inverter:12:3': '/__l5e/assets-v1/19e9be3f-a3cc-4ac2-8187-ece6f6cdeeb2/deye-12kw-3ph.png',
    'inverter:16:3': '/__l5e/assets-v1/d33bf508-b074-4767-af0f-b178fc426dfb/deye-16kw-3ph.jpg',
    'inverter:20:3': '/__l5e/assets-v1/3284c033-3aad-4f2f-87f4-2edbf0601246/deye-20kw-3ph.jpg',
    'inverter:50:3:deye': '/__l5e/assets-v1/9cb4721e-423c-40d9-bc39-f109324c44b2/deye-50kw-3ph.jpg',
    'inverter:50:3:solis': '/__l5e/assets-v1/9289ddc6-2b93-4edd-9c8f-071b61ab7a8e/solis-50kw-3ph.jpg',
    'battery:1.28': '/__l5e/assets-v1/576ef1be-f531-446a-80da-08c1b8ac9002/battery-pylontech-12v-100ah.jpg',
    'battery:2.56': '/__l5e/assets-v1/7e5f4bcf-5b98-42c8-81c2-ff4f821b08a5/battery-pylontech-12v-200ah.jpg',
    'battery:4': '/__l5e/assets-v1/020ed5eb-bd8c-4628-b267-141bd3f9240c/battery-hithium-12v-314ah.jpg',
    'battery:5.12': '/__l5e/assets-v1/93d46fe0-9f31-4e74-b65e-0731d4ede1cf/battery-pylontech-uf5000-5.12kwh.jpg',
    'battery:16': '/__l5e/assets-v1/d53b83df-90eb-4843-916d-4d2a6ec9d14e/battery-pylontech-fidus-16kwh.jpg',
    'battery:16:hv': '/__l5e/assets-v1/b3834a17-3879-4c1a-aa71-83a0436e6b4e/battery-hithium-legnd-16kwh.jpg',
    'bms:hv:16': '/__l5e/assets-v1/dd0d8edc-a69b-4960-ab6a-152479ef7696/01-hv-control.jpg',
    'cable': '/__l5e/assets-v1/7b41c63d-c1d7-4519-9091-584e16f02e94/actes-cable-6.jpg',
    'cable:10': '/__l5e/assets-v1/6e78b280-b902-4295-828f-b23f6e4b157a/actes-cable-10.jpg',
    'cable:flex:4x50': '/__l5e/assets-v1/77a1f82e-18d3-468c-b7ab-a685d8bb24d1/actes-cable-flex-4x50.jpg',
    'cable:earth:6': '/__l5e/assets-v1/5389c236-e7ad-4b6f-aa00-927413a0fe91/actes-cable-earth-6.jpg',
    'cable:earth:16': '/__l5e/assets-v1/536f2b43-262a-466c-97df-7bae922ae29d/actes-cable-earth-16.jpg',
    'dc:1': '/__l5e/assets-v1/9c746798-e905-4c91-b692-e92687d7bc04/actes-dc-1.jpg',
    'dc:2': '/__l5e/assets-v1/d3f782c2-3f3b-4ccb-8063-8162e920f5f0/actes-dc-2.jpg',
    'dc:3': '/__l5e/assets-v1/f42dd6d7-5480-4f15-aa46-39f765776aa0/actes-dc-3.jpg',
    'dc:4': '/__l5e/assets-v1/a5c44463-f1c2-4512-91b2-1c5eb804a659/actes-dc-4.jpg',
    'dc:4-4': '/__l5e/assets-v1/5dcbeeef-f1a6-4e43-82ce-fb8893bf56c5/actes-dc-4-4.jpg',
    'ac:1': '/__l5e/assets-v1/1a9d0854-5639-4579-b9dd-a5ed987a364a/actes-ac-1p.jpg',
    'ac:3': '/__l5e/assets-v1/95573f50-3c77-4e1e-9cef-d5d022c7616e/actes-ac-3p.jpg',
    'ac:3-100': '/__l5e/assets-v1/60055ca8-ef20-4f56-bedc-9a4b9d156cb6/actes-ac-3p-100a.jpg',
    'ac:3-175': '/__l5e/assets-v1/17e27078-4aa0-4294-99e0-31c1741d9ee8/actes-ac-3p-175a.jpg',
    'bat:box:250': '/__l5e/assets-v1/a5c9bb57-c024-4e13-a581-fc368995b380/02-mccb-box.jpg',
    'ess:cab:112': '/__l5e/assets-v1/921c424f-7f85-4d03-a59e-4c4a5f0307ec/actes-112kwh-heroee.jpg',
    'ess:cab:313': '/__l5e/assets-v1/1cbdb581-5669-4bf4-820b-a9204b872ec3/actes-313kwh-pylontech.jpg',
    'ess:rack:104': '/__l5e/assets-v1/613e64af-71d3-4b74-9537-1a0595908911/actes-104kwh-powercube-m1.jpg',
    'ess:rack:61.5': '/__l5e/assets-v1/e9a07b9d-de4a-4831-bab4-123bd8783f62/actes-61-5kwh-powercube.jpg',
    'earth:pit': '/__l5e/assets-v1/1d13a6f0-8c9a-45bd-a72f-a73c456d8cfb/03-earthing.jpg',
    'fire:co2:6': '/__l5e/assets-v1/38e4bcbc-e695-4498-a3df-28338f04f6ea/04-co2.jpg',
    'fire:ball': '/__l5e/assets-v1/88016042-7cbf-4966-a057-2590b52f3321/05-fireball.jpg',
    'base:3m': '/__l5e/assets-v1/f5dc4b25-47fa-4376-b7e5-bab31bfa1b85/06-mounting.jpg',
    'acc:install': '/__l5e/assets-v1/2edd9dda-70b3-47cb-9c44-0f031b561222/07-accessories.jpg',
    'labor:panel': '/__l5e/assets-v1/930340fc-8d5f-447f-92b1-66fef64f1588/08-installation.jpg'
  };
  // مطابقة بالاسم للبنود التي لا تحمل كود صنف تعتمد على عنوان الصنف أولاً ثم التفاصيل
  function __imgTitle(nm) { return String(nm || '').split('|')[0]; }
  function __imgNum(s, re) { var m = String(s).match(re); return m ? parseFloat(String(m[1]).replace(',', '.')) : null; }
  function itemImgByName(nm) {
    var all = String(nm || '');
    var t = __imgTitle(all);
    var is3 = /ثري|ثلاث|3\s*\/?\s*4?\s*فاز|3ph/i.test(all);
    // 1) الانفرتر (العنوان فقط حتى لا تلتقط كلمة "انفرتر" من التفاصيل)
    if (/انفرتر/.test(t)) {
      var kw = __imgNum(all, /(\d+(?:[.,]\d+)?)\s*كيلو/);
      if (/سوليز|سوليس|solis/i.test(all)) { return (kw && kw >= 100) ? ITEM_IMG['inverter:50:3:solis'] : ITEM_IMG['inverter:50:3:solis']; }
      if (kw === null) { return ITEM_IMG['inverter:8:1']; }
      if (kw <= 2) { return ITEM_IMG['inverter:1.6:1']; }
      if (kw <= 7) { return ITEM_IMG['inverter:6.2:1']; }
      if (kw <= 10) { return ITEM_IMG['inverter:8:1']; }
      if (kw <= 13) { return is3 ? ITEM_IMG['inverter:12:3'] : ITEM_IMG['inverter:12:1']; }
      if (kw <= 18) { return is3 ? ITEM_IMG['inverter:16:3'] : ITEM_IMG['inverter:16:1']; }
      if (kw <= 30) { return ITEM_IMG['inverter:20:3']; }
      return ITEM_IMG['inverter:50:3:deye'];
    }
    // 2) الألواح الشمسية
    if (/ألواح|الواح|لوح\s|لوح شمس|N-?Type/i.test(t)) {
      return /595/.test(all) ? ITEM_IMG['panel:595'] : ITEM_IMG['panel:720'];
    }
    // 3) كنترول البطاريات
    if (/كنترول/.test(t)) { return ITEM_IMG['bms:hv:16']; }
    // 4) الكبائن والراكات
    if (/كبينة/.test(t)) { return /313/.test(all) ? ITEM_IMG['ess:cab:313'] : ITEM_IMG['ess:cab:112']; }
    if (/راك/.test(t)) { return /61/.test(all) ? ITEM_IMG['ess:rack:61.5'] : ITEM_IMG['ess:rack:104']; }
    // 5) البطاريات
    if (/بطارية|بطاريات/.test(t) && !/صندوق/.test(t)) {
      if (/1\.28|RV12100|100\sأمبير/i.test(all)) { return ITEM_IMG['battery:1.28']; }
      if (/2\.56|RV12200|200\sأمبير/i.test(all)) { return ITEM_IMG['battery:2.56']; }
      if (/314|(^|[^\d])4\s*كيلو/.test(all)) { return ITEM_IMG['battery:4']; }
      if (/5\.12|UF5000/i.test(all)) { return ITEM_IMG['battery:5.12']; }
      if (/هاي فولتج|HV|LEGND|HeroEE/i.test(all)) { return ITEM_IMG['battery:16:hv']; }
      return ITEM_IMG['battery:16'];
    }
    // 6) صندوق حماية البطاريات
    if (/صندوق حماية بطاريات|MCCB-2P-250/.test(all)) { return ITEM_IMG['bat:box:250']; }
    // 7) لوحات التيار المستمر DC
    if (/مستمر|(^|[^A-Za-z])DC([^A-Za-z]|$)/.test(t)) {
      if (/خط دخول|دخول\s\d|دمج/.test(t)) { return ITEM_IMG['dc:4-4']; }
      var g = __imgNum(all, /(\d+)\s(?:مجموع|خط)/);
      if (g >= 4) { return ITEM_IMG['dc:4']; }
      if (g === 3) { return ITEM_IMG['dc:3']; }
      if (g === 2) { return ITEM_IMG['dc:2']; }
      return ITEM_IMG['dc:1'];
    }
    // 8) لوحات التيار المتردد AC
    if (/متردد|(^|[^A-Za-z])AC([^A-Za-z]|$)|فاز/.test(t)) {
      if (/175/.test(all)) { return ITEM_IMG['ac:3-175']; }
      if (is3 && /100/.test(all)) { return ITEM_IMG['ac:3-100']; }
      if (is3) { return ITEM_IMG['ac:3']; }
      return ITEM_IMG['ac:1'];
    }
    // 9) الكابلات
    if (/كابل/.test(t)) {
      if (/فلكس/.test(all)) { return ITEM_IMG['cable:flex:4x50']; }
      if (/أرت|ارت/.test(all)) { return /16/.test(all) ? ITEM_IMG['cable:earth:16'] : ITEM_IMG['cable:earth:6']; }
      if (/10\s*(?:مم|ملي)/.test(all)) { return ITEM_IMG['cable:10']; }
      return ITEM_IMG['cable'];
    }
    // 10) السلامة
    if (/تأريض/.test(t)) { return ITEM_IMG['earth:pit']; }
    if (/طفاية/.test(t)) { return ITEM_IMG['fire:co2:6']; }
    if (/كرة حريق/.test(t)) { return ITEM_IMG['fire:ball']; }
    // 11) الاستند: لا توجد صورة خاصة به لا نرسل صورة عشوائية
    if (/استند|ستاند/.test(t)) { return null; }
    if (/قاعدة|قواعد/.test(t)) { return ITEM_IMG['base:3m']; }
    if (/اكسسوار|إكسسوار|مستلزمات|كنش|MC4/i.test(t)) { return ITEM_IMG['acc:install']; }
    if (/اجور|أجور|تركيب/.test(t)) { return ITEM_IMG['labor:panel']; }
    return null;
  }
  function itemImgPath(it) {
    if (!it) { return null; }
    var k = String(it.key || '');
    if (k && ITEM_IMG[k]) { return ITEM_IMG[k]; }
    var nm = String((it.name || ''));
    if (it.details && it.details.length) { nm += ' | ' + it.details.join(' | '); }
    return itemImgByName(nm);
  }
  function itemImgOrder(it) {
    var t = __imgTitle((it && it.name) || '');
    if (/انفرتر/.test(t)) { return 1; }
    if (/ألواح|الواح|لوح\s|N-?Type|595|720/i.test(t)) { return 2; }
    if (/بطارية|بطاريات|كبينة|راك|كنترول/.test(t)) { return 3; }
    if (/مستمر|DC/.test(t)) { return 4; }
    if (/متردد|AC|فاز/.test(t)) { return 5; }
    if (/كابل/.test(t)) { return 6; }
    return 7;
  }
  // ===================== نهاية صور الأصناف =====================

  var SINV_IMG = { lp16: 'lipower16', lp62: 'lipower62', deye8: 'deye8', deye12s: 'deye12', deye16: 'deye16', deye12: 'deye12t', deye16t: 'deye16t', deye20: 'deye20t', deye50: 'deye50t', solis50: 'solis50' };
  var PKG_IMG = { r1: 'lipower16', r2: 'lipower16', r3: 'lipower16', r4: 'lipower16', r5: 'lipower16', r6: 'lipower62', r7: 'lipower62', r8: 'lipower62', r9: 'lipower62', r10: 'deye8', r11: 'deye8', r12: 'deye8', r13: 'deye8', r14: 'deye8', r15: 'deye12', r16: 'deye12' };
  var COM_IMG = { p8: 'deye8', p9: 'deye8', p14: 'deye8', p16: 'deye8', p18: 'deye8',
    i12p9: 'deye12', i12p18: 'deye12', i12p21: 'deye12', i12p27: 'deye12',
    i16p18: 'deye16', i16p21: 'deye16', i16p24: 'deye16', i16p36: 'deye16',
    i16t26: 'deye16t', i16t30: 'deye16t', i16t33: 'deye16t', i16t36: 'deye16t',
    i20t30: 'deye20t', i20t33: 'deye20t', i20t39: 'deye20t', i20t52: 'deye20t',
   };
  // الصورة تُلحق فقط برسائل عرض المنظومة التي تُعيّن inv_pick صراحةً (لا تحليل نصوص)
  var __invFound = (inv_pick && INV_IMG_FILES[inv_pick]) ? { key: inv_pick, line: inv_pick_line } : null;
  var __noImgFlow = (menu_choice === '1' || menu_choice === '2');
  var inv_img_url = null; // صور المنتجات معطلة نهائياً
  var inv_img_line = __invFound ? __invFound.line : '';
  var INV_HDR_URL = null;


  function btnMsg(bodyText, btnList) {
    var arr = [];
    for (var k = 0; k < btnList.length && k < 3; k++) {
      arr.push({ type: 'reply', reply: { id: btnList[k].id, title: truncate(btnList[k].title, 20) } });
    }
    return {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'image', image: { link: headerImageForStep(typeof step !== 'undefined' ? step : '') || OTHER_MESSAGES_IMAGE_URL } },
        body: { text: bodyText },
        action: { buttons: arr }
      }
    };
  }

  // ===================== صور بنود عرض السعر (تُرسل قبل ملف PDF) =====================
  var QUOTE_IMG_ITEMS = {"ACTES-608": [{"key": "", "name": "لوح سنتك N-Type 595 وات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 1.28 كيلو (RV12100)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "انفرتر ليو باور هايبرد 1.6 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "استند حامل حديد مع لوحة الحماية", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 20, "price": 0, "total": 0}], "ACTES-609": [{"key": "", "name": "لوح سنتك N-Type 595 وات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 2.56 كيلو (RV12200)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "انفرتر ليو باور هايبرد 1.6 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "استند حامل حديد مع لوحة الحماية", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 20, "price": 0, "total": 0}], "ACTES-607": [{"key": "", "name": "لوح سنتك N-Type 595 وات", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم هيثيوم 4 كيلو 314 أمبير", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "انفرتر ليو باور هايبرد 1.6 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "استند حامل حديد مع لوحة الحماية", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-613": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 4, "price": 0, "total": 0}, {"key": "", "name": "انفرتر ليو باور هايبرد 6.2 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 5.12 كيلو (UF5000)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 5.12 كيلو (UF5000)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-626": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 8, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 5.12 كيلو (UF5000)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-627": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 8, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-631": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 8, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 10مم", "unit": "متر", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "اكسسوارات توصيل (كونكتورات MC4)", "unit": "طقم", "qty": 3, "price": 0, "total": 0}], "ACTES-674": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 9, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-671": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 14, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-673": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 16, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-672": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 18, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 8 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-676": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 9, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 12 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-677": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 18, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 12 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-678": [{"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 27, "price": 0, "total": 0}, {"key": "", "name": "انفرتر دايا هايبرد 12 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-679": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 18, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-680": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 21, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-681": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 24, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-682": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 36, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC سنجل فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-683": [{"key": "", "name": "انفرتر دايا هايبرد 12 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 9, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-684": [{"key": "", "name": "انفرتر دايا هايبرد 12 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 18, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 2 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 30, "price": 0, "total": 0}], "ACTES-685": [{"key": "", "name": "انفرتر دايا هايبرد 12 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 21, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 2, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-686": [{"key": "", "name": "انفرتر دايا هايبرد 12 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 27, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-687": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 26, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-688": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 30, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-689": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 33, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-690": [{"key": "", "name": "انفرتر دايا هايبرد 16 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 36, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية كهرباء تيار متردد AC ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-692": [{"key": "", "name": "انفرتر دايا هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 30, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "انفرتر هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-693": [{"key": "", "name": "انفرتر دايا هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 33, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 3, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "انفرتر هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-694": [{"key": "", "name": "انفرتر دايا هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 39, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 4, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "انفرتر هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 90, "price": 0, "total": 0}], "ACTES-695": [{"key": "", "name": "انفرتر دايا هايبرد 20 كيلو ثري فاز", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوح سنتك N-Type 720 وات", "unit": "حبه", "qty": 52, "price": 0, "total": 0}, {"key": "", "name": "بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)", "unit": "حبه", "qty": 4, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 3 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "لوحة حماية تيار مستمر DC — 4 مجموعات", "unit": "حبه", "qty": 1, "price": 0, "total": 0}, {"key": "", "name": "كابل نحاس مجلفن 6مم", "unit": "متر", "qty": 120, "price": 0, "total": 0}]};

  // خريطة ربط أسماء بنود صور العروض الجاهزة بمفاتيح الأسعار في الكتالوج
  var QUOTE_IMG_PRICE_KEYS = {
    'لوح سنتك N-Type 595 وات': 'panel:595',
    'لوح سنتك N-Type 720 وات': 'panel:720',
    'انفرتر ليو باور هايبرد 1.6 كيلو سنجل فاز': 'inverter:1.6:1',
    'انفرتر ليو باور هايبرد 6.2 كيلو سنجل فاز': 'inverter:6.2:1',
    'انفرتر دايا هايبرد 8 كيلو سنجل فاز': 'inverter:8:1',
    'انفرتر دايا هايبرد 12 كيلو سنجل فاز': 'inverter:12:1',
    'انفرتر دايا هايبرد 16 كيلو سنجل فاز': 'inverter:16:1',
    'انفرتر دايا هايبرد 12 كيلو ثري فاز': 'inverter:12:3',
    'انفرتر دايا هايبرد 16 كيلو ثري فاز': 'inverter:16:3',
    'انفرتر دايا هايبرد 20 كيلو ثري فاز': 'inverter:20:3',
    'انفرتر هايبرد 20 كيلو ثري فاز': 'inverter:20:3',
    'بطارية ليثيوم بايلونتك 1.28 كيلو (RV12100)': 'battery:1.28',
    'بطارية ليثيوم بايلونتك 2.56 كيلو (RV12200)': 'battery:2.56',
    'بطارية ليثيوم هيثيوم 4 كيلو 314 أمبير': 'battery:4',
    'بطارية ليثيوم بايلونتك 5.12 كيلو (UF5000)': 'battery:5.12',
    'بطارية ليثيوم بايلونتك 16 كيلو (فيدوس)': 'battery:16',
    'كابل نحاس مجلفن 6مم': 'cable',
    'كابل نحاس مجلفن 10مم': 'cable:10',
    'لوحة حماية تيار مستمر DC — 2 مجموعات': 'dc:2',
    'لوحة حماية تيار مستمر DC — 3 مجموعات': 'dc:3',
    'لوحة حماية تيار مستمر DC — 4 مجموعات': 'dc:4',
    'لوحة حماية كهرباء تيار متردد AC سنجل فاز': 'ac:1',
    'لوحة حماية كهرباء تيار متردد AC ثري فاز': 'ac:3',
    'استند حامل حديد مع لوحة الحماية': 'base:3m',
    'اكسسوارات توصيل (كونكتورات MC4)': 'acc:install'
  };

  // فهرس أسعار الكتالوج (المفتاح -> السعر الأساسي) لاستخدامه كبديل عند غياب سعر البند
  var CATALOG_BASE_PRICE = (function () {
    var m = {}, cid, i;
    for (cid in ITEM_CATS) {
      if (!ITEM_CATS.hasOwnProperty(cid)) { continue; }
      var its = (ITEM_CATS[cid] && ITEM_CATS[cid].items) || [];
      for (i = 0; i < its.length; i++) { m[its[i][0]] = { price: Number(its[i][3]) || 0, name: String(its[i][1] || '') }; }
    }
    return m;
  })();
  var CATALOG_KEY_BY_NAME = (function () {
    var m = {}, k;
    for (k in CATALOG_BASE_PRICE) { if (CATALOG_BASE_PRICE.hasOwnProperty(k)) { m[CATALOG_BASE_PRICE[k].name] = k; } }
    return m;
  })();

  // إرجاع سعر الوحدة لبند صورة: من البند نفسه، ثم من مفتاحه، ثم من اسمه عبر الخريطة/الكتالوج
  function imgUnitPrice(it) {
    if (!it) { return 0; }
    var p = Number(it.price) || 0;
    if (p > 0) { return p; }
    var nm = String(it.name || '').trim();
    var key = String(it.key || '') || QUOTE_IMG_PRICE_KEYS[nm] || CATALOG_KEY_BY_NAME[nm] || '';
    if (!key) { return 0; }
    var base = CATALOG_BASE_PRICE[key] ? CATALOG_BASE_PRICE[key].price : 0;
    return Number(itemPrice(key, base)) || 0;
  }

  // بنود العروض الجاهزة (PDF جاهز) تُبنى من QUOTE_IMG_ITEMS لأن quote_items لا تُملأ في تلك المسارات
  var quote_images = [];
  if (false) { // صور مكونات العرض معطلة؛ تُستخدم هوية ACTES فقط
    var __qi = stripBaseItems(Array.isArray(quote_items) ? quote_items.slice(0) : []);
    if (!__qi.length && quote_number && QUOTE_IMG_ITEMS[quote_number]) {
      __qi = stripBaseItems(QUOTE_IMG_ITEMS[quote_number].slice(0));
    }
    __qi.sort(function (a, b) { return itemImgOrder(a) - itemImgOrder(b); });
    var __seen = {};
    for (var qz = 0; qz < __qi.length; qz++) {
      var __p = itemImgPath(__qi[qz]);
      if (!__p || __seen[__p]) { continue; }
      __seen[__p] = true;
      var __q = __qi[qz];
      quote_images.push({
        link: ASSET_BASE + __p,
        caption: String(__q.name || '') + (__q.qty ? ('\nالكمية: ' + __q.qty + ' ' + (__q.unit || '')) : '') + (function(){ var __up = imgUnitPrice(__q); return __up > 0 ? ('\nسعر الوحدة: ' + fxMoney(__up) + ' $') : ''; })()
      });
    }
    // إلغاء رسالة تفاصيل عرض السعر النصية: صور المكونات ثم ملف PDF فقط
    response = '';
    pre_text = '';
  }


  if (step === 'main_menu') {
    // القائمة الرئيسية: 3 أزرار في رسالة واحدة مع صورة في الرأس
    wa_payload = buildPayload(response, step);
  } else {
    if (!followup_kind && __ui && String(response).length > 1020) {
      pre_text = response;
      response = (lang === 'en') ? ' *Choose one of the options below*' : ' اختر أحد الخيارات أدناه';
    }
    // المنظومة بنص قصير (بدون رسالة تفاصيل): نضع صورة الانفرتر في رأس رسالة الأزرار مباشرة
    INV_HDR_URL = pre_text ? null : inv_img_url;
    if (followup_kind === 'qnext') {
      var __qnextBody = String(response || '');
      if (__qnextBody.length > 1020) { __qnextBody = quoteAfterPdf(quote_items); }
      wa_payload = buildPayload(__qnextBody, 'qnext_ask');
    } else {
      wa_payload = followup_kind
        ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { preview_url: false, body: response } }
        : buildPayload(response, step);
    }
    pre_payload = pre_text ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { preview_url: false, body: pre_text } } : null;
  }
  if (!response) { wa_payload = null; pre_payload = null; }
  var has_pre_text = !!pre_payload;
  // صورة الانفرتر: تُستخدم في رأس رسالة الأزرار إن كانت الرسالة تفاعلية،
  // وإلا تُرسل كرسالة صورة مستقلة قبل نص المنظومة (عقدة Send Inv Image)
  var __inv_hdr_used = !!(INV_HDR_URL && wa_payload && wa_payload.type === 'interactive' && wa_payload.interactive && wa_payload.interactive.header && wa_payload.interactive.header.type === 'image' && wa_payload.interactive.header.image && wa_payload.interactive.header.image.link === INV_HDR_URL);
  var has_inv_img = false; // لا تُرسل صور المنتجات
  var inv_img_caption = has_inv_img ? ('🔌 ' + inv_img_line) : '';

  // ===================== رسالة المتابعة (تُرسل كرسالة ثانية مستقلة) =====================
  var followup_payload = null;
  if (followup_kind === 'study') {
    followup_payload = btnMsg(studyAskMsg(), [{ id: 'study_yes', title: 'نعم' }, { id: 'buy_invoice', title: 'متابعة الشراء' }, { id: 'sales_contact', title: 'التواصل مع المبيعات' }]);
  } else if (followup_kind === 'sld') {
    followup_payload = btnMsg(pv_flow ? pvSldAskMsg() : sldAskMsg(), [{ id: 'sld_yes', title: 'نعم' }, { id: 'sld_no', title: 'لا' }]);
  } else if (followup_kind === 'pvquote') {
    followup_payload = btnMsg(pvQuoteAskMsg(), [{ id: 'pv_q_yes', title: 'نعم' }, { id: 'pv_q_no', title: 'لا' }]);
  } else if (followup_kind === 'qnext') {
    // عرض السعر قد يكون طويلًا؛ أرسل أزرار المتابعة في رسالة مستقلة حتى لا تختفي أزرار WhatsApp.
    // 1) متابعة الشراء  2) PVsyst/SLD  3) العودة خطوة
    followup_payload = btnMsg(W('اختر الإجراء التالي'), [
      { id: 'aq_buy', title: 'متابعة الشراء' },
      { id: 'aq_plan', title: 'PVsyst/SLD' },
      { id: 'back_step', title: 'العودة خطوة' }
    ]);
  } else if (followup_kind === 'buy') {
    followup_payload = btnMsg(buyAskMsg(), [{ id: 'buy_invoice', title: 'متابعة الشراء' }, { id: 'sales_contact', title: 'التواصل مع المبيعات' }, backBtn()]);
  }
  var has_followup = !!followup_payload;

  // ===== رأس ثابت لرسائل PVsyst و SLD =====
  var __topicImg = (function () {
    var st = String(step || '');
    if (/^pay_/.test(st)) { return payHeaderImage(); }
    if (/buy|pay|item|cart/.test(st)) { return null; }
    if (/sld/.test(st)) { return SLD_IMAGE_URL; }
    if (/^pv_|study|pvsyst|site|city|gov/.test(st)) { return PVSTUDY_IMAGE_URL; }
    if (String(menu_choice) === '7' && !/start|welcome|main_menu|menu_|done/.test(st)) { return PVSTUDY_IMAGE_URL; }
    return null;
  })();
  function __applyTopicHdr(p) {
    if (!p || !__topicImg) { return p; }
    if (p.type === 'interactive' && p.interactive && p.interactive.type === 'button') {
      p.interactive.header = { type: 'image', image: { link: __topicImg } };
      return p;
    }
    if (p.type === 'text' && p.text && String(p.text.body || '').length <= 1000) {
      return { messaging_product: 'whatsapp', recipient_type: 'individual', to: p.to, type: 'image', image: { link: __topicImg, caption: p.text.body } };
    }
    return p;
  }
  function __isList(p) { return !!(p && p.type === 'interactive' && p.interactive && p.interactive.type === 'list'); }
  wa_payload = __applyTopicHdr(wa_payload);
  pre_payload = __applyTopicHdr(pre_payload);
  followup_payload = __applyTopicHdr(followup_payload);
  // رسائل القوائم لا تقبل صورة في الرأس -> نرسل الصورة كرسالة مستقلة قبلها
  if (__topicImg && __isList(wa_payload) && !pre_payload) {
    // واتساب لا يدعم صورة داخل رأس القائمة؛ لا نرسل صورة منفصلة بلا تعليق.
  }
  if (__topicImg && pre_payload && pre_payload.type === 'text' && String(pre_payload.text.body || '').length <= 1000) {
    pre_payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'image', image: { link: __topicImg, caption: pre_payload.text.body } };
  }
  has_pre_text = !!pre_payload;

  // هوية ACTES في رأس الرسالة نفسها؛ النص القصير يكون تعليق الصورة لا رسالة ثانية.
  function __applyActesIdentity(p) {
    if (!p) { return p; }
    if (p.type === 'interactive' && p.interactive && p.interactive.type === 'button') {
      p.interactive.header = { type: 'image', image: { link: OTHER_MESSAGES_IMAGE_URL } };
      return p;
    }
    if (p.type === 'text' && p.text && String(p.text.body || '').length <= 1024) {
      return { messaging_product: 'whatsapp', recipient_type: 'individual', to: p.to || phone, type: 'image', image: { link: OTHER_MESSAGES_IMAGE_URL, caption: p.text.body } };
    }
    return p;
  }
  wa_payload = __applyActesIdentity(wa_payload);
  pre_payload = __applyActesIdentity(pre_payload);
  followup_payload = __applyActesIdentity(followup_payload);
  has_pre_text = !!pre_payload;


  // دراسة PVsyst لا تُرسل تلقائياً مع عرض السعر تُرسل فقط بعد سؤال العميل وموافقته (خطوة study_ask / pv_study_ask)

  // ===================== معاملات دراسة PVsyst للمنظومة المختارة =====================
  if (send_study_file && !pv_flow) {
    try {
      if (menu_choice === '2') {
        // الدراسة تقرأ نفس قرار المنظومة الموحد (بدون إعادة اختيار)
        var _cfgS = comConfig();
        if (_cfgS) {
          study_params = { kind: 'com', com: {
            code: _cfgS.code, kw: _cfgS.recKw, chosenKw: _cfgS.chosenKw, nInv: _cfgS.nInv,
            panels: _cfgS.panels, pv: _cfgS.pv, bat: _cfgS.bat, batKey: _cfgS.batKey, nBat: _cfgS.nBat,
            daily: _cfgS.daily, day: _cfgS.dayGen, night: _cfgS.nightGen, phase3: _cfgS.phase3,
            inv_key: _cfgS.sldInv, inv_name: _cfgS.invName, inv_model: _cfgS.invModel
          }, quote_number: _cfgS.quoteNum };
        } else {
          study_params = null;
          send_study_file = false;
        }
      } else {
        var spCode = (system_type && RES_QUOTE_NUM[system_type]) ? system_type : (((lookupByBill(parseFloat(monthly_consumption), '1') || {}).code) || 'r1');
        study_params = { kind: 'res', sys_code: spCode, quote_number: RES_QUOTE_NUM[spCode] || '' };
      }
      // Study must consume the same quotation snapshot that was issued to the client.
      var __studyQuote = decodeQuoteContext(session.project_type || project_type);
      if (__studyQuote && Array.isArray(__studyQuote.quote_items) && __studyQuote.quote_items.length) {
        study_params.quote_items = __studyQuote.quote_items;
        study_params.quote_number = __studyQuote.quote_number || study_params.quote_number || '';
        study_params.customer_name = __studyQuote.customer_name || customer_name;
        study_params.city = __studyQuote.city || city;
        study_params.quote_source = 'FORMAL_QUOTATION_SNAPSHOT';
      } else if (Array.isArray(quote_items) && quote_items.length) {
        study_params.quote_items = stripBaseItems(quote_items);
        study_params.quote_number = quote_number || study_params.quote_number || '';
        study_params.quote_source = 'CURRENT_QUOTE_BUILD_DATASET';
      } else {
        study_params.quote_source = 'QUOTE_NOT_AVAILABLE';
      }

      // ===== Exact selected/recommended system snapshot for PVsyst =====
      // When a residential package is selected, use its exact catalog rows from RES_TABLE.
      // When a commercial package is selected, use the exact commercial build generated
      // from the same comConfig() decision. Never invent a different equipment set here.
      function catalogRowsToQuoteItems(rows) {
        var out = [];
        if (!Array.isArray(rows)) return out;
        for (var ci = 0; ci < rows.length; ci++) {
          var it = rows[ci] || [];
          var qtyN = Number(it[4]) || 0;
          var priceN = Number(it[5]) || 0;
          out.push({
            key: String(it[0] || ''),
            name: String(it[1] || ''),
            details: Array.isArray(it[2]) ? it[2].map(String) : [],
            unit: String(it[3] || ''),
            qty: qtyN,
            price: priceN,
            total: qtyN * priceN
          });
        }
        return out;
      }

      // Formal issued quotation remains the highest-priority source above.
      if (!Array.isArray(study_params.quote_items) || !study_params.quote_items.length) {
        if (study_params.kind === 'res' && study_params.sys_code && Array.isArray(RES_TABLE)) {
          var __resExact = null;
          for (var __ri = 0; __ri < RES_TABLE.length; __ri++) {
            if (String(RES_TABLE[__ri].code) === String(study_params.sys_code)) { __resExact = RES_TABLE[__ri]; break; }
          }
          if (__resExact && Array.isArray(__resExact.items)) {
            study_params.quote_items = catalogRowsToQuoteItems(__resExact.items);
            study_params.selected_system_code = String(__resExact.code);
            study_params.selected_system_label = String(__resExact.name || __resExact.label || __resExact.code);
            study_params.quote_source = 'SELECTED_RESIDENTIAL_SYSTEM_CATALOG';
            study_params.quote_status = 'Selected system snapshot';
          }
        } else if (study_params.kind === 'com' && study_params.com) {
          try {
            var __comExact = comBuildQuoteItems(study_params.com);
            if (__comExact && Array.isArray(__comExact.items) && __comExact.items.length) {
              study_params.quote_items = __comExact.items;
              study_params.selected_system_code = String(study_params.com.code || '');
              study_params.selected_system_label = String(comSysLabel(study_params.com));
              study_params.quote_source = 'SELECTED_COMMERCIAL_SYSTEM_CATALOG';
              study_params.quote_status = 'Selected system snapshot';
            }
          } catch (__ce) {}
        }
      }

      // For a load-sized custom study, pvStudyParams already carries the exact build
      // generated by pvQuoteItems(z); expose it explicitly as the recommended system.
      if (study_params.kind === 'custom' && Array.isArray(study_params.quote_items) && study_params.quote_items.length) {
        study_params.selected_system_code = String((study_params.cfg && study_params.cfg.name) || study_params.selected_system_code || 'CUSTOM_STUDIED_SYSTEM');
        study_params.selected_system_label = String((study_params.cfg && study_params.cfg.name) || study_params.selected_system_label || 'Recommended system from load study');
        if (!study_params.quote_source || study_params.quote_source === 'QUOTE_BUILD_DATASET') {
          study_params.quote_source = 'RECOMMENDED_SYSTEM_BUILD_DATASET';
        }
      }

      // ===== Engineering snapshot: EXACT selected system equipment =====
      // Keep quote_items for the client-facing quotation. Separately expose the
      // exact selected/recommended system rows that the simulation engine must use
      // for panel / inverter / battery extraction. This prevents stale fallback
      // study settings from overriding a valid selected package.
      try {
        if (study_params.kind === 'res' && study_params.sys_code && Array.isArray(RES_TABLE)) {
          var __engRes = null;
          for (var __eri = 0; __eri < RES_TABLE.length; __eri++) {
            if (String(RES_TABLE[__eri].code) === String(study_params.sys_code)) { __engRes = RES_TABLE[__eri]; break; }
          }
          if (__engRes && Array.isArray(__engRes.items)) {
            study_params.engineering_items = catalogRowsToQuoteItems(__engRes.items);
            study_params.engineering_source = 'EXACT_SELECTED_RESIDENTIAL_SYSTEM';
            study_params.selected_system_code = String(__engRes.code);
            study_params.selected_system_label = String(__engRes.name || __engRes.label || __engRes.code);
          }
        } else if (study_params.kind === 'com' && study_params.com) {
          var __engCom = comBuildQuoteItems(study_params.com);
          if (__engCom && Array.isArray(__engCom.items) && __engCom.items.length) {
            study_params.engineering_items = __engCom.items;
            study_params.engineering_source = 'EXACT_SELECTED_COMMERCIAL_SYSTEM';
          }
        } else if (study_params.kind === 'custom' && Array.isArray(study_params.quote_items) && study_params.quote_items.length) {
          study_params.engineering_items = study_params.quote_items;
          study_params.engineering_source = 'EXACT_RECOMMENDED_CUSTOM_SYSTEM';
        }
        if (!Array.isArray(study_params.engineering_items) || !study_params.engineering_items.length) {
          study_params.engineering_items = Array.isArray(study_params.quote_items) ? study_params.quote_items : [];
          study_params.engineering_source = study_params.engineering_items.length ? 'QUOTE_SNAPSHOT_FALLBACK' : 'NO_ENGINEERING_SNAPSHOT';
        }
      } catch (__engErr) {
        study_params.engineering_items = Array.isArray(study_params.quote_items) ? study_params.quote_items : [];
        study_params.engineering_source = study_params.engineering_items.length ? 'QUOTE_SNAPSHOT_FALLBACK_AFTER_ENGINEERING_ERROR' : 'NO_ENGINEERING_SNAPSHOT';
      }

      study_params.customer_name = study_params.customer_name || customer_name; study_params.city = study_params.city || city; study_params.monthly_consumption = monthly_consumption;
      study_params.peak_load = peak_load; study_params.phase_type = phase_type; study_params.night_hours = night_hours;
    } catch (e) { study_params = { kind: 'res', sys_code: 'r1', customer_name: customer_name, city: city, quote_source: 'QUOTE_CONTEXT_ERROR' }; }
  }

  // ===================== معاملات مخطط SLD (SLD) للمنظومة المختارة =====================
  if (make_sld && !sld_params) {
    // (1) الأولوية القصوى: منظومة دراسة PVsyst المحفوظة في الجلسة (main_loads)
    try {
      var _zs = pvDesign();
      if (_zs) {
        var _pvs = pvLoad() || {};
        sld_params = pvSldParams(_zs, _pvs.c || city, quote_number || ('ACT-SLD-' + String(Date.now()).slice(-6)));
      }
    } catch (e) { sld_params = null; }
    // (2) ثم نتيجة الدراسة المبنية في هذه الرسالة / بيانات الجلسة
    if (!sld_params) { try { sld_params = buildSldParams(); } catch (e2) { sld_params = null; } }
    if (sld_params) {
      // Use the formal quotation snapshot as the single source for SLD components.
      var __sldQuote = decodeQuoteContext(session.project_type || project_type);
      if (__sldQuote && Array.isArray(__sldQuote.quote_items) && __sldQuote.quote_items.length) {
        sld_params.quote_items = __sldQuote.quote_items;
        sld_params.quote_number = __sldQuote.quote_number || sld_params.quote_number || '';
        sld_params.customer_name = __sldQuote.customer_name || customer_name;
        sld_params.city_en = __sldQuote.city || sld_params.city_en || city;
        sld_params.quote_source = 'FORMAL_QUOTATION_SNAPSHOT';
      } else if (Array.isArray(quote_items) && quote_items.length) {
        sld_params.quote_items = stripBaseItems(quote_items);
        sld_params.quote_number = quote_number || sld_params.quote_number || '';
        sld_params.quote_source = 'CURRENT_QUOTE_BUILD_DATASET';
      } else {
        sld_params.quote_source = 'QUOTE_NOT_AVAILABLE';
      }
    }
    if (!sld_params) {
      make_sld = false;
      step = 'res_browse';
      response = W(' لم يتم تحديد المنظومة\n' + SEP + '\nلإنشاء مخطط SLD/DWG صحيح، اختر المنظومة أولاً أو أكمل الدراسة، ثم اطلب المخطط._\n\nاختر منظومة من الأزرار بالأسفل:_');
    }
  }

  function buildSldParams() {
    var PANELS = {
      p595: { model: 'Suntech STP595S-C54/Nshm+ Bifacial', wp: 595, voc: 53.96, vmp: 45.53, imp: 13.07, isc: 13.97 },
      p720: { model: 'Suntech STP720S-D66/Nsh+ Bifacial TOPCon', wp: 720, voc: 48.45, vmp: 40.45, imp: 17.81, isc: 18.83 }
    };
    var INVERTERS = {
      lp16: { model: 'Li Power Hybrid 1.6kW / 12V', kwac: 1.6, vmin: 30, vmax: 500, vbat: 12, mppt: 1, ph: 1 },
      lp62: { model: 'Li Power Hybrid 6.2kW / 48V', kwac: 6.2, vmin: 60, vmax: 500, vbat: 48, mppt: 2, ph: 1 },
      deye8: { model: 'Deye SUN-8K-SG01LP1-EU', kwac: 8, vmin: 150, vmax: 500, vbat: 48, mppt: 2, ph: 1 },
      deye12: { model: 'Deye SUN-12K-SG04LP3-EU', kwac: 12, vmin: 160, vmax: 800, vbat: 48, mppt: 2, ph: 3 },
      deye16: { model: 'Deye SUN-16K-SG01LP1-EU', kwac: 16, vmin: 150, vmax: 500, vbat: 48, mppt: 2, ph: 1 },
      deye20: { model: 'Deye SUN-20K-SG01HP3-EU', kwac: 20, vmin: 160, vmax: 800, vbat: 48, mppt: 2, ph: 3 },
      deye12s: { model: 'Deye SUN-12K-SG04LP1-EU', kwac: 12, vmin: 150, vmax: 500, vbat: 48, mppt: 2, ph: 1 },
      deye16t: { model: 'Deye SUN-16K-SG01HP3-EU', kwac: 16, vmin: 160, vmax: 800, vbat: 48, mppt: 2, ph: 3 },
      deye50: { model: 'Deye SUN-50K-SG01HP3-EU-BM3', kwac: 50, vmin: 200, vmax: 1000, vbat: 48, mppt: 3, ph: 3 },
      solis50: { model: 'Solis S6-EH3P50K-H(21A)', kwac: 50, vmin: 150, vmax: 1000, vbat: 150, vbatMin: 150, vbatMax: 800, vbatRange: '150-800', mppt: 4, ph: 3 },
      deye80: { model: 'Deye SUN-80K-SG01HP3-EU', kwac: 80, vmin: 200, vmax: 1000, vbat: 512, mppt: 4, ph: 3 },
      solis125: { model: 'Solis S6-EH3P125K-H', kwac: 125, vmin: 150, vmax: 1000, vbat: 300, vbatMin: 300, vbatMax: 950, vbatRange: '300-950', mppt: 10, ph: 3 }
    };
    var BATTERIES = {
      rv12100: { model: 'Pylontech RV12100', kwh: 1.28 },
      rv12200: { model: 'Pylontech RV12200', kwh: 2.56 },
      hth4: { model: 'HTHIUM HeroEE Neo 4', kwh: 4 },
      uf5000: { model: 'Pylontech UF5000', kwh: 5.12 },
      fidus16: { model: 'Pylontech Fidus FB-L-16-PRO', kwh: 16.076 },
      hth16: { model: 'HTHIUM HeroEE 16', kwh: 16.0768 },
      hthv16: { model: 'HTHIUM LEGND112S-EPM-16HV', kwh: 16 },
      ess615: { model: 'Pylontech H32148-C Rack 61.5 kWh', kwh: 61.5 },
      ess104: { model: 'Pylontech H32148-C Rack 104 kWh', kwh: 104 },
      ess112: { model: 'HTHIUM LEGEND 112C Cabinet 112 kWh', kwh: 112 },
      ess313: { model: 'Pylontech OPTIM US A300-HY Cabinet 313 kWh', kwh: 313 }
    };
    var RES_SYS = {
      r1: { name: '1.6 kW Residential System (1 panel + 1.28 kWh)', panel: 'p595', nPan: 1, inv: 'lp16', nInv: 1, bat: 'rv12100', nBat: 1 },
      r2: { name: '1.6 kW Residential System (1 panel + 2.56 kWh)', panel: 'p595', nPan: 1, inv: 'lp16', nInv: 1, bat: 'rv12200', nBat: 1 },
      r3: { name: '1.6 kW Residential System (2 panels + 2.56 kWh)', panel: 'p595', nPan: 2, inv: 'lp16', nInv: 1, bat: 'rv12200', nBat: 1 },
      r4: { name: '1.6 kW Residential System (2 panels + 4 kWh)', panel: 'p595', nPan: 2, inv: 'lp16', nInv: 1, bat: 'hth4', nBat: 1 },
      r5: { name: '1.6 kW Residential System (3 panels + 4 kWh)', panel: 'p595', nPan: 3, inv: 'lp16', nInv: 1, bat: 'hth4', nBat: 1 },
      r6: { name: '6.2 kW Residential System (4 panels + 5.12 kWh)', panel: 'p720', nPan: 4, inv: 'lp62', nInv: 1, bat: 'uf5000', nBat: 1 },
      r7: { name: '6.2 kW Residential System (4 panels + 5.12 kWh)', panel: 'p720', nPan: 4, inv: 'lp62', nInv: 1, bat: 'uf5000', nBat: 1 },
      r8: { name: '6.2 kW Residential System (5 panels + 10.24 kWh)', panel: 'p720', nPan: 5, inv: 'lp62', nInv: 1, bat: 'uf5000', nBat: 2 },
      r9: { name: '6.2 kW Residential System (6 panels + 16 kWh)', panel: 'p720', nPan: 6, inv: 'lp62', nInv: 1, bat: 'fidus16', nBat: 1 },
      r10: { name: '8 kW Residential System (8x720W + 16 kWh)', panel: 'p720', nPan: 8, inv: 'deye8', nInv: 1, bat: 'fidus16', nBat: 1 },
      r11: { name: '8 kW Residential System (9x720W + 16 kWh)', panel: 'p720', nPan: 9, inv: 'deye8', nInv: 1, bat: 'fidus16', nBat: 1 },
      r12: { name: '8 kW Residential System (14x720W + 32 kWh)', panel: 'p720', nPan: 14, inv: 'deye8', nInv: 1, bat: 'fidus16', nBat: 2 },
      r13: { name: '8 kW Residential System (16x720W + 32 kWh)', panel: 'p720', nPan: 16, inv: 'deye8', nInv: 1, bat: 'fidus16', nBat: 2 },
      r14: { name: '8 kW Residential System (18x720W + 32 kWh)', panel: 'p720', nPan: 18, inv: 'deye8', nInv: 1, bat: 'fidus16', nBat: 2 },
      r15: { name: '12 kW Residential System (21x720W + 32 kWh)', panel: 'p720', nPan: 21, inv: 'deye12s', nInv: 1, bat: 'fidus16', nBat: 2 },
      r16: { name: '12 kW Residential System (27x720W + 48 kWh)', panel: 'p720', nPan: 27, inv: 'deye12s', nInv: 1, bat: 'fidus16', nBat: 3 }
    };
    var cfg = null; var qref = '';
    // أولوية: نتيجة دراسة PVsyst إن وُجدت (سكني / تجاري / مخصص)
    if (typeof study_params !== 'undefined' && study_params) {
      if (study_params.kind === 'custom' && study_params.cfg) {
        var sc = study_params.cfg;
        if (PANELS[sc.panel] && INVERTERS[sc.inv]) {
          cfg = { panel: sc.panel, nPan: Number(sc.nPan) || 0, inv: sc.inv, nInv: Math.max(1, Number(sc.nInv) || 1), bat: BATTERIES[sc.bat] ? sc.bat : '', nBat: BATTERIES[sc.bat] ? Math.max(0, Number(sc.nBat) || 0) : 0 };
          qref = study_params.quote_number || '';
        }
      } else if (study_params.kind === 'res' && RES_SYS[study_params.sys_code]) {
        cfg = RES_SYS[study_params.sys_code];
        qref = study_params.quote_number || RES_QUOTE_NUM[study_params.sys_code] || '';
      } else if (study_params.kind === 'com' && study_params.com) {
        var srow = study_params.com;
        var sis3 = (study_params.phase_type === 'three') || !!srow.phase3;
        var sik = srow.inv_key || comSldInvKey(Number(srow.chosenKw) || Number(srow.kw) || 8, sis3);
        cfg = {
          panel: 'p720', nPan: Number(srow.panels) || 8,
          inv: (INVERTERS[sik] ? sik : 'deye8'), nInv: Math.max(1, Number(srow.nInv) || 1),
          bat: (BATTERIES[srow.batKey] ? srow.batKey : 'hth16'),
          nBat: Math.max(1, Number(srow.nBat) || Math.round((Number(srow.bat) || 16) / 16))
        };
        if (srow.inv_model) { cfg.invModel = srow.inv_model; }
        qref = study_params.quote_number || '';
      }
    }
    if (!cfg && menu_choice === '2') {
      // المخطط يقرأ نفس قرار المنظومة الموحد (نفس الألواح والبطاريات وعدد الانفرترات)
      var _cfgD = comConfig();
      if (!_cfgD) { return null; } // لا منظومة تجارية محددة -> لا ترسم مخططاً عشوائياً
      var ik = INVERTERS[_cfgD.sldInv] ? _cfgD.sldInv : 'deye8';
      cfg = {
        panel: 'p720', nPan: _cfgD.panels, inv: ik, nInv: _cfgD.nInv,
        bat: (BATTERIES[_cfgD.batKey] ? _cfgD.batKey : 'hth16'), nBat: _cfgD.nBat,
        invModel: _cfgD.invModel
      };
      qref = _cfgD.quoteNum;
    } else if (!cfg) {
      var code = (system_type && RES_QUOTE_NUM[system_type]) ? system_type : ((lookupByBill(parseFloat(monthly_consumption), '1') || {}).code) || null;
      if (!code || !RES_SYS[code]) { return null; } // لا منظومة مختارة/مدروسة -> لا ترسم s1 افتراضياً
      cfg = RES_SYS[code];
      qref = RES_QUOTE_NUM[code] || '';
    }
    var PAN = PANELS[cfg.panel]; var INV = INVERTERS[cfg.inv]; var BAT = BATTERIES[cfg.bat];
    if (!PAN || !INV) { return null; }
    if (cfg.invModel) { INV = Object.assign({}, INV, { model: cfg.invModel }); }
    if (!BAT) { cfg.nBat = 0; BAT = { model: '', kwh: 0 }; }
    if (!(cfg.nBat > 0)) { BAT = { model: '', kwh: 0 }; }
    var perStr = Math.max(1, Math.min(cfg.nPan, Math.floor((INV.vmax * 0.9) / PAN.voc)));
    if (INV.vbat === 12) { perStr = Math.min(perStr, 4); }
    var nStr = Math.max(1, Math.ceil(cfg.nPan / perStr));
    // نحافظ على عدد الألواح كما في عرض السعر، ونوزع السلاسل على عدد الانفرترات الفعلي إن أمكن
    var nIv = Math.max(1, Number(cfg.nInv) || 1);
    var nPan = cfg.nPan;
    var pick = 0;
    for (var k1 = nStr; k1 <= nPan; k1++) { if (nPan % k1 === 0 && k1 % nIv === 0) { pick = k1; break; } }
    if (!pick) { for (var k2 = nStr; k2 <= nPan; k2++) { if (nPan % k2 === 0) { pick = k2; break; } } }
    if (pick) { nStr = pick; perStr = nPan / nStr; }
    else { nStr = Math.max(1, Math.ceil(nPan / perStr)); perStr = Math.ceil(nPan / nStr); nPan = perStr * nStr; }
    var kWp = nPan * PAN.wp / 1000;
    var cityEn = String(city || '').replace(/[^\x20-\x7E]/g, '').trim().toUpperCase() || 'PROJECT SITE';
    return {
      designer: 'SUFYAN JAMIL',
      panel: { model: PAN.model, wp: PAN.wp, voc: PAN.voc, vmp: PAN.vmp, imp: PAN.imp, isc: PAN.isc },
      inv: { model: INV.model, kwac: INV.kwac, vmin: INV.vmin, vmax: INV.vmax, vbat: INV.vbat },
      bat: { model: BAT.model, kwh: BAT.kwh }, batKey: (cfg.nBat > 0 ? cfg.bat : ''),
      nStr: nStr, perStr: perStr, nPan: nPan, nInv: cfg.nInv, nBat: cfg.nBat,
      kWp: kWp, phase3: (INV.ph === 3) || (menu_choice === '2' && phase_type === 'three'), mppt: INV.mppt * cfg.nInv,
      strVoc: perStr * PAN.voc, strVmp: perStr * PAN.vmp,
      peak: parseFloat(peak_load) || 0, daily: (parseFloat(monthly_consumption) || 0) / 30,
      sysLabel: 'HYBRID', city_en: cityEn,
      date: new Date().toISOString().slice(0, 10),
      ref: qref, project: 'ACTES SOLAR PV SYSTEM',
      send_dxf: false, // لا يُرسل ملف DXF للعميل نهائياً
      filename: 'ACTES-SLD-' + String(Date.now()).slice(-6)
    };
  }

  // ===== ACTES Formal WhatsApp Formatting =====
  // تنسيق بصري فقط: لا يتم تغيير أي كلمة أو رقم أو رابط أو قيمة من محتوى الرسالة.
  // يتم توحيد المسافات، الأسطر الفارغة، والفواصل الرسمية، مع إبقاء نص الرسالة نفسه.
  function noBlank(s) {
    return String(s == null ? '' : s)
      .replace(/\\r\\n/g, '\\n')
      .replace(/[ \\t]+\\n/g, '\\n')
      .replace(/\\n{3,}/g, '\\n\\n')
      .replace(/^\\n+/, '')
      .replace(/\\n+$/, '');
  }
  function formalText(s) {
    var raw = noBlank(s);
    if (!raw) return raw;
    var lines = raw.split('\\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i]).trim();
      if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
      out.push(line);
    }
    while (out.length && out[0] === '') out.shift();
    while (out.length && out[out.length - 1] === '') out.pop();

    // فصل بصري موحد حول الفواصل الرسمية فقط؛ لا يمس النص نفسه.
    var finalLines = [];
    for (var j = 0; j < out.length; j++) {
      finalLines.push(out[j]);
      if (out[j] === SEP && j < out.length - 1 && out[j + 1] !== '') {
        finalLines.push('');
      }
    }
    return finalLines.join('\\n');
  }
  function noBlankDeep(v) {
    if (typeof v === 'string') { return noBlank(v); }
    if (Array.isArray(v)) { return v.map(noBlankDeep); }
    if (v && typeof v === 'object') { var out = {}; for (var k in v) { out[k] = noBlankDeep(v[k]); } return out; }
    return v;
  }
  function formatOutboundPayload(p) {
    if (!p || typeof p !== 'object') return p;
    if (p.type === 'text' && p.text && typeof p.text.body !== 'undefined') {
      p.text.body = formalText(p.text.body);
    }
    if (p.type === 'image' && p.image && typeof p.image.caption !== 'undefined') {
      p.image.caption = formalText(p.image.caption);
    }
    if (p.type === 'document' && p.document && typeof p.document.caption !== 'undefined') {
      p.document.caption = formalText(p.document.caption);
    }
    if (p.type === 'interactive' && p.interactive) {
      if (p.interactive.body && typeof p.interactive.body.text !== 'undefined') {
        p.interactive.body.text = formalText(p.interactive.body.text);
      }
      if (p.interactive.footer && typeof p.interactive.footer.text !== 'undefined') {
        p.interactive.footer.text = formalText(p.interactive.footer.text);
      }
    }
    return p;
  }
  // ===== سياسة الضمان النهائية للرسائل =====
  function enforceMsgWarrantyPolicy(s) {
    var x = String(s == null ? '' : s);
    var lines = x.split('\n');
    for (var mi = 0; mi < lines.length; mi++) {
      var ln = lines[mi];
      var panelLine = /(?:لوح|ألواح|الواح|panel)/i.test(ln);
      var batteryLine = /(?:بطاري|battery)/i.test(ln);
      ln = ln.replace(/\s*\|?\s*ضمان[^|،؛\n]*/ig, '');
      if (panelLine && batteryLine) {
        ln += ' | الضمان: الألواح 25 سنة | البطاريات 5 سنوات';
      } else if (panelLine) {
        ln += ' | الضمان: 25 سنة';
      } else if (batteryLine) {
        ln += ' | الضمان: 5 سنوات';
      }
      ln = ln.replace(/بارات نحاس للتوزيع والتأريض(?: مع كامل التوصيلات الداخلية)?/g, '');
      lines[mi] = ln;
    }
    return lines.join('\n');
  }
  if (response) { response = enforceMsgWarrantyPolicy(response); response = formalText(response); }
  if (notification_text) { notification_text = formalText(notification_text); }
  if (typeof pre_text !== 'undefined' && pre_text) { pre_text = formalText(pre_text); }
  if (typeof inv_img_caption !== 'undefined' && inv_img_caption) { inv_img_caption = formalText(inv_img_caption); }
  if (typeof quote_caption !== 'undefined' && quote_caption) { quote_caption = formalText(quote_caption); }
  if (typeof wa_payload !== 'undefined' && wa_payload) { wa_payload = formatOutboundPayload(noBlankDeep(wa_payload)); }
  if (typeof pre_payload !== 'undefined' && pre_payload) { pre_payload = formatOutboundPayload(noBlankDeep(pre_payload)); }
  if (typeof followup_payload !== 'undefined' && followup_payload) { followup_payload = formatOutboundPayload(noBlankDeep(followup_payload)); }
  extra_payloads = noBlankDeep(extra_payloads).map(formatOutboundPayload);

  if (send_quote_file && quote_number) {
    var __lcPersist = lastConsumptionKwh();
    var __qsPacked = packQuoteContext(quote_number, quote_items);
    project_type = 'Q|' + quote_number + '|' + (quote_file_url || '') + '|' + (__quote_total || 0) +
      (__lcPersist > 0 ? ('|LC=' + __lcPersist) : '') +
      (__qsPacked ? ('|QS=' + __qsPacked) : '');
  }
  var has_extra = extra_payloads.length > 0;

  return [{ json: { extra_payloads, has_extra, phone, message_id, phone_number_id, text_response: response, pre_text, pre_payload, has_pre_text, has_inv_img, inv_img_url: has_inv_img ? inv_img_url : null, inv_img_caption, wa_payload, followup_payload, has_followup, notify_employee, notification_text, step, lang, menu_choice, customer_name, city, system_type, monthly_consumption, peak_load, night_hours, activity_type, main_loads, load_type, pump_capacity, daily_hours, device_type, problem_desc, project_type, service_needed, wants_quote, phase_type, quote_file_url, quote_file_name, quote_number, quote_caption, send_quote_file, send_study_file, study_params, make_sld, sld_params, item_quote, quote_items, quote_images, has_quote_images: quote_images.length > 0, cart: JSON.stringify(cart), updated_at: now } }];

}

export function runBot(session, parsed, itemPrices) {
  const out = runStateMachine(session, parsed, itemPrices);
  return (out && out[0] && out[0].json) || null;
}
