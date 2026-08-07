/* ============================================================
   TAKAYA — booking wizard
   Real availability comes from Cal.com via /api/slots and /api/book
   (Cloudflare Pages Functions) — the API key never reaches this file.
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
        meta: '٦٠ دقيقة',
        eventTypeId: 6594267
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

  function timeLabel(iso) {
    return new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  var state = { step: 1, type: null, item: null, slotsByDate: null, date: null, slotIso: null };

  var steps = root.querySelectorAll('.wizard-step');
  var progressDots = root.querySelectorAll('.wizard-progress span');
  var nextBtn = root.querySelector('#next-btn');
  var backBtn = root.querySelector('#back-btn');
  var itemListEl = root.querySelector('#item-list');
  var step2Eyebrow = root.querySelector('#step2-eyebrow');
  var step2Title = root.querySelector('#step2-title');
  var dayPickerEl = root.querySelector('#day-picker');
  var slotGridEl = root.querySelector('#slot-grid');
  var step3Sub = root.querySelector('#step3-sub');
  var summaryEl = root.querySelector('#summary');
  var summaryFinalEl = root.querySelector('#summary-final');
  var form = root.querySelector('#booking-form');
  var submitStatus = root.querySelector('#submit-status');

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ar-OM', {
      timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long'
    });
  }

  function render() {
    steps.forEach(function (s) {
      s.classList.toggle('active', Number(s.dataset.step) === state.step);
    });
    progressDots.forEach(function (dot) {
      var n = Number(dot.dataset.step);
      dot.classList.toggle('active', n === state.step);
      dot.classList.toggle('done', n < state.step);
    });

    var nav = root.querySelector('#wizard-nav');
    nav.style.display = state.step === 5 ? 'none' : 'flex';
    backBtn.style.visibility = state.step === 1 ? 'hidden' : 'visible';
    nextBtn.textContent = state.step === 4 ? 'تأكيد الحجز' : 'التالي';
    updateNextEnabled();
  }

  function updateNextEnabled() {
    var ok = true;
    if (state.step === 1) ok = !!state.type;
    if (state.step === 2) ok = !!state.item;
    if (state.step === 3) ok = !!(state.date && state.slotIso);
    if (state.step === 4) ok = form.checkValidity();
    nextBtn.disabled = !ok;
    nextBtn.style.opacity = ok ? '1' : '0.55';
  }

  function selectType(type) {
    state.type = type;
    state.item = null;
    root.querySelectorAll('.choice-card').forEach(function (c) {
      c.classList.toggle('selected', c.dataset.type === type);
    });
    updateNextEnabled();
  }

  function populateItems() {
    var items = CATALOGUE[state.type] || [];
    step2Eyebrow.textContent = TYPE_LABEL[state.type];
    step2Title.textContent = state.type === 'course' ? 'اختر البرنامج' : 'اختر المساحة';
    itemListEl.innerHTML = '';
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
        updateNextEnabled();
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
    step3Sub.textContent = state.item ? state.item.name + ' — اختر الموعد الأنسب' : '';

    var url = '/api/slots?eventTypeId=' + encodeURIComponent(state.item.eventTypeId) +
      '&timeZone=' + encodeURIComponent(TIME_ZONE);

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
            dayPickerEl.querySelectorAll('.day-pill').forEach(function (p) { p.classList.remove('selected'); });
            btn.classList.add('selected');
            populateSlots();
            updateNextEnabled();
          });
          dayPickerEl.appendChild(btn);
          if (i === 0) btn.click();
        });
      })
      .catch(function () {
        dayPickerEl.innerHTML = '';
        slotGridEl.innerHTML = '';
        step3Sub.innerHTML = '<span style="color:#8A3B22">تعذّر تحميل المواعيد المتاحة الآن. تواصل معنا مباشرة لتنسيق موعد.</span>';
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
        updateNextEnabled();
      });
      slotGridEl.appendChild(btn);
    });
  }

  function summaryRows() {
    return (
      '<dl>' +
      '<dt>النوع</dt><dd>' + TYPE_LABEL[state.type] + '</dd>' +
      '<dt>الاختيار</dt><dd>' + state.item.name + '</dd>' +
      '<dt>التاريخ</dt><dd>' + fmtDate(state.slotIso) + '</dd>' +
      '<dt>الوقت</dt><dd class="ltr">' + timeLabel(state.slotIso) + '</dd>' +
      '</dl>'
    );
  }

  function goNext() {
    if (nextBtn.disabled) return;

    if (state.step === 3) {
      summaryEl.innerHTML = summaryRows();
    }

    if (state.step === 4) {
      submitBooking();
      return;
    }

    state.step += 1;
    if (state.step === 2) populateItems();
    if (state.step === 3) loadSlots();
    render();
  }

  function goBack() {
    if (state.step === 1) return;
    state.step -= 1;
    render();
  }

  function submitBooking() {
    var data = Object.fromEntries(new FormData(form).entries());
    if (data.company_website) return; // honeypot

    nextBtn.disabled = true;
    nextBtn.textContent = 'جارٍ الإرسال…';
    submitStatus.classList.remove('show', 'error');

    var payload = {
      eventTypeId: state.item.eventTypeId,
      start: state.slotIso,
      name: data.name,
      email: data.email,
      phone: data.phone,
      timeZone: TIME_ZONE
    };

    fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (body) {
        if (body && body.ok) {
          summaryFinalEl.innerHTML = summaryRows();
          state.step = 5;
          render();
        } else {
          throw new Error((body && body.error) || 'failed');
        }
      })
      .catch(function (err) {
        submitStatus.textContent = (err && err.message && /no longer be available/i.test(err.message))
          ? 'هذا الموعد لم يعد متاحًا. الرجاء اختيار موعد آخر.'
          : 'تعذّر إرسال الحجز من هنا. راسلنا على واتساب أو بريدنا الإلكتروني وسنؤكد حجزك يدويًا.';
        submitStatus.classList.add('show', 'error');
      })
      .then(function () {
        nextBtn.disabled = false;
        nextBtn.textContent = 'تأكيد الحجز';
      });
  }

  root.querySelectorAll('.choice-card').forEach(function (card) {
    card.addEventListener('click', function () { selectType(card.dataset.type); });
  });

  nextBtn.addEventListener('click', goNext);
  backBtn.addEventListener('click', goBack);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('input', updateNextEnabled);

  var params = new URLSearchParams(window.location.search);
  var presetType = params.get('type');
  if (presetType === 'course' || presetType === 'space') {
    selectType(presetType);
    state.step = 2;
    populateItems();
  }

  render();
})();
