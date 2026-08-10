/* ============================================================
   TAKAYA — booking form (single page)
   Real availability comes from Cal.com via /api/slots and /api/book
   (Cloudflare Pages Functions) — the API key never reaches this file.
   All sections live on one page and reveal progressively as the
   visitor completes each choice; no step navigation.
   ============================================================ */
(function () {
  'use strict';

  var root = document.querySelector('[data-wizard]');
  if (!root) return;

  var CATALOGUE = {
    course: [
      {
        id: 'tamkeen',
        name: 'برنامج تمكين',
        desc: 'جلسة تعريفية لاكتشاف البرنامج قبل الالتحاق.',
        meta: '٦٠ دقيقة',
        eventTypeId: 6594286
      }
    ],
    space: [
      {
        id: 'training-room',
        name: 'قاعة تكايا للتدريب',
        desc: 'قاعة مجهزة داخل مقر تكايا بمسقط.',
        meta: 'من ساعة حتى ٣ ساعات',
        eventTypeId: 6594267,
        durations: [60, 120, 180]
      }
    ]
  };

  var TYPE_LABEL = { course: 'برنامج', space: 'مساحة' };
  var DOW_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var TIME_ZONE = 'Asia/Muscat';

  function toArabicDigits(n) {
    return String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[d]; });
  }

  function formatDuration(mins) {
    var hrs = mins / 60;
    if (hrs === 1) return 'ساعة واحدة';
    if (hrs === 2) return 'ساعتان';
    if (Number.isInteger(hrs)) return toArabicDigits(hrs) + ' ساعات';
    return toArabicDigits(mins) + ' دقيقة';
  }

  function timeLabel(iso) {
    return new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ar-OM', {
      timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long'
    });
  }

  var state = { type: null, item: null, duration: null, slotsByDate: null, date: null, slotIso: null };

  var sections = {
    type: root.querySelector('[data-section="type"]'),
    item: root.querySelector('[data-section="item"]'),
    slot: root.querySelector('[data-section="slot"]'),
    details: root.querySelector('[data-section="details"]'),
    success: root.querySelector('[data-section="success"]')
  };

  var itemListEl = root.querySelector('#item-list');
  var durationPickerEl = root.querySelector('#duration-picker');
  var itemEyebrow = root.querySelector('#item-eyebrow');
  var itemTitle = root.querySelector('#item-title');
  var dayPickerEl = root.querySelector('#day-picker');
  var slotGridEl = root.querySelector('#slot-grid');
  var slotSub = root.querySelector('#slot-sub');
  var summaryEl = root.querySelector('#summary');
  var summaryFinalEl = root.querySelector('#summary-final');
  var form = root.querySelector('#booking-form');
  var submitBtn = root.querySelector('#submit-btn');
  var submitStatus = root.querySelector('#submit-status');
  var slipInput = root.querySelector('#b-slip');
  var slipHint = root.querySelector('#slip-hint');
  var slipHintDefault = slipHint ? slipHint.textContent : '';
  var MAX_SLIP_BYTES = 4 * 1024 * 1024;
  var SLIP_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

  function show(section, scroll) {
    var el = sections[section];
    if (!el) return;
    var wasHidden = !el.classList.contains('active');
    el.classList.add('active');
    if (scroll && wasHidden) {
      requestAnimationFrame(function () {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function hide(section) {
    var el = sections[section];
    if (el) el.classList.remove('active');
  }

  function updateSubmitEnabled() {
    var ok = !!(state.slotIso && form.checkValidity());
    submitBtn.disabled = !ok;
    submitBtn.style.opacity = ok ? '1' : '0.55';
  }

  function updateSummary() {
    if (!state.item || !state.slotIso) { summaryEl.innerHTML = ''; return; }
    summaryEl.innerHTML = summaryRows();
  }

  function summaryRows() {
    var durationRow = (state.item.durations && state.item.durations.length > 1)
      ? '<dt>المدة</dt><dd>' + formatDuration(state.duration) + '</dd>'
      : '';
    return (
      '<dl>' +
      '<dt>النوع</dt><dd>' + TYPE_LABEL[state.type] + '</dd>' +
      '<dt>الاختيار</dt><dd>' + state.item.name + '</dd>' +
      durationRow +
      '<dt>التاريخ</dt><dd>' + fmtDate(state.slotIso) + '</dd>' +
      '<dt>الوقت</dt><dd class="ltr">' + timeLabel(state.slotIso) + '</dd>' +
      '</dl>'
    );
  }

  function validateSlip() {
    if (!slipInput) return;
    var field = slipInput.closest('.field');
    var file = slipInput.files && slipInput.files[0];
    var msg = '';

    if (file) {
      if (file.size > MAX_SLIP_BYTES) {
        msg = 'حجم الملف كبير — الحد الأقصى 4 ميجابايت.';
      } else if (SLIP_TYPES.indexOf(file.type) === -1) {
        msg = 'الرجاء رفع صورة (PNG/JPEG/WEBP) أو ملف PDF.';
      }
    }

    slipInput.setCustomValidity(msg);
    if (field) field.classList.toggle('invalid', !!msg);
    if (slipHint) slipHint.textContent = msg || slipHintDefault;
  }

  function readSlipAsBase64() {
    var file = slipInput && slipInput.files && slipInput.files[0];
    if (!file) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var base64 = result.slice(result.indexOf(',') + 1);
        resolve({ filename: file.name, type: file.type, dataBase64: base64 });
      };
      reader.onerror = function () { reject(new Error('file-read-failed')); };
      reader.readAsDataURL(file);
    });
  }

  /* ---- Flow ---- */

  function resetFrom(level) {
    // level: 'item' clears item + downstream, 'slot' clears slot downstream
    if (level === 'item') {
      state.item = null;
      state.duration = null;
    }
    state.slotsByDate = null;
    state.date = null;
    state.slotIso = null;
    hide('slot');
    hide('details');
    updateSummary();
    updateSubmitEnabled();
  }

  function selectType(type, scroll) {
    if (state.type === type) return;
    state.type = type;
    root.querySelectorAll('.choice-card').forEach(function (c) {
      c.classList.toggle('selected', c.dataset.type === type);
    });
    resetFrom('item');
    populateItems();
    show('item', scroll !== false);
  }

  function maybeStartSlots() {
    if (state.item && state.duration) {
      show('slot', true);
      loadSlots();
    }
  }

  function renderDurationPicker(item) {
    durationPickerEl.innerHTML = '';
    if (!item.durations || item.durations.length < 2) {
      state.duration = (item.durations && item.durations[0]) || 60;
      return;
    }
    state.duration = null;
    var label = document.createElement('p');
    label.className = 'duration-label';
    label.textContent = 'المدة المطلوبة';
    var row = document.createElement('div');
    row.className = 'duration-row';
    item.durations.forEach(function (mins) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'duration-pill';
      btn.textContent = formatDuration(mins);
      btn.addEventListener('click', function () {
        state.duration = mins;
        row.querySelectorAll('.duration-pill').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        resetFrom('slot');
        maybeStartSlots();
      });
      row.appendChild(btn);
    });
    durationPickerEl.appendChild(label);
    durationPickerEl.appendChild(row);
  }

  function populateItems() {
    var items = CATALOGUE[state.type] || [];
    itemEyebrow.textContent = TYPE_LABEL[state.type];
    itemTitle.textContent = state.type === 'course' ? 'اختر البرنامج' : 'اختر المساحة';
    itemListEl.innerHTML = '';
    durationPickerEl.innerHTML = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item-card';
      btn.dataset.id = item.id;
      btn.innerHTML =
        '<span><h4>' + item.name + '</h4><p>' + item.desc + '</p></span>' +
        '<span class="item-meta">' + item.meta + '</span>';
      btn.addEventListener('click', function () {
        state.item = item;
        itemListEl.querySelectorAll('.item-card').forEach(function (c) { c.classList.remove('selected'); });
        btn.classList.add('selected');
        resetFrom('slot');
        renderDurationPicker(item);
        maybeStartSlots();
      });
      itemListEl.appendChild(btn);
    });
    if (items.length === 1) {
      itemListEl.firstChild.click();
    }
  }

  function loadSlots() {
    state.slotsByDate = null;
    state.date = null;
    state.slotIso = null;
    dayPickerEl.innerHTML = '';
    slotGridEl.innerHTML = '<p class="muted" style="font-size:0.88rem">جارٍ تحميل المواعيد المتاحة…</p>';
    slotSub.textContent = state.item ? state.item.name + ' — اختر الموعد الأنسب' : '';

    var url = '/api/slots?eventTypeId=' + encodeURIComponent(state.item.eventTypeId) +
      '&timeZone=' + encodeURIComponent(TIME_ZONE);
    if (state.duration) url += '&duration=' + encodeURIComponent(state.duration);

    fetch(url)
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (body) {
        if (!body || !body.ok) throw new Error((body && body.error) || 'failed');
        state.slotsByDate = body.slots || {};
        var dates = Object.keys(state.slotsByDate).filter(function (d) {
          return (state.slotsByDate[d] || []).length > 0;
        }).sort();

        if (!dates.length) {
          slotGridEl.innerHTML = '';
          dayPickerEl.innerHTML = '<p class="muted" style="font-size:0.88rem">لا توجد مواعيد متاحة في الأيام القادمة حاليًا. تواصل معنا مباشرة لتنسيق موعد.</p>';
          return;
        }

        dayPickerEl.innerHTML = '';
        dates.forEach(function (dateKey, i) {
          var d = new Date(dateKey + 'T00:00:00');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'day-pill';
          btn.innerHTML =
            '<span class="dow">' + DOW_SHORT[d.getDay()] + '</span>' +
            '<span class="dom">' + toArabicDigits(d.getDate()) + '</span>';
          btn.addEventListener('click', function () {
            state.date = dateKey;
            state.slotIso = null;
            hide('details');
            dayPickerEl.querySelectorAll('.day-pill').forEach(function (p) { p.classList.remove('selected'); });
            btn.classList.add('selected');
            populateSlots();
            updateSummary();
            updateSubmitEnabled();
          });
          dayPickerEl.appendChild(btn);
          if (i === 0) btn.click();
        });
      })
      .catch(function () {
        dayPickerEl.innerHTML = '';
        slotGridEl.innerHTML = '';
        slotSub.innerHTML = '<span style="color:#8A3B22">تعذّر تحميل المواعيد المتاحة الآن. تواصل معنا مباشرة لتنسيق موعد.</span>';
      });
  }

  function populateSlots() {
    slotGridEl.innerHTML = '';
    var daySlots = (state.slotsByDate && state.slotsByDate[state.date]) || [];
    daySlots.forEach(function (s) {
      var iso = typeof s === 'string' ? s : (s.start || s.time);
      if (!iso) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = timeLabel(iso);
      btn.addEventListener('click', function () {
        state.slotIso = iso;
        slotGridEl.querySelectorAll('.slot-btn').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        updateSummary();
        show('details', true);
        updateSubmitEnabled();
      });
      slotGridEl.appendChild(btn);
    });
  }

  function submitBooking() {
    var data = Object.fromEntries(new FormData(form).entries());
    if (data.company_website) return; // honeypot

    validateSlip();
    if (!state.slotIso || !form.checkValidity()) {
      form.reportValidity();
      updateSubmitEnabled();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ رفع الإيصال…';
    submitStatus.classList.remove('show', 'error');

    readSlipAsBase64()
      .then(function (slip) {
        submitBtn.textContent = 'جارٍ الإرسال…';
        var payload = {
          eventTypeId: state.item.eventTypeId,
          start: state.slotIso,
          name: data.name,
          email: data.email,
          phone: data.phone,
          timeZone: TIME_ZONE,
          slip: slip
        };
        if (state.duration) payload.lengthInMinutes = state.duration;
        return fetch('/api/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (body) {
        if (body && body.ok) {
          summaryFinalEl.innerHTML = summaryRows();
          var slipWarning = root.querySelector('#slip-warning');
          if (slipWarning) slipWarning.classList.toggle('show', body.slipDelivered === false);
          ['type', 'item', 'slot', 'details'].forEach(hide);
          show('success', true);
        } else {
          throw new Error((body && body.error) || 'failed');
        }
      })
      .catch(function (err) {
        submitStatus.textContent = (err && err.message && /no longer be available/i.test(err.message))
          ? 'هذا الموعد لم يعد متاحًا. الرجاء اختيار موعد آخر.'
          : (err && err.message === 'file-read-failed')
            ? 'تعذّر قراءة ملف الإيصال. جرّب ملفًا آخر.'
            : 'تعذّر إرسال الحجز من هنا. راسلنا على واتساب أو بريدنا الإلكتروني وسنؤكد حجزك يدويًا.';
        submitStatus.classList.add('show', 'error');
      })
      .then(function () {
        if (!sections.success.classList.contains('active')) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'تأكيد الحجز';
        }
      });
  }

  /* ---- Wiring ---- */

  root.querySelectorAll('.choice-card').forEach(function (card) {
    card.addEventListener('click', function () { selectType(card.dataset.type); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitBooking();
  });
  form.addEventListener('input', updateSubmitEnabled);
  if (slipInput) {
    slipInput.addEventListener('change', function () {
      validateSlip();
      updateSubmitEnabled();
    });
  }

  var params = new URLSearchParams(window.location.search);
  var presetType = params.get('type');
  if (presetType === 'course' || presetType === 'space') {
    selectType(presetType, false);
  }

  updateSubmitEnabled();
})();
