/* ============================================================
   TAKAYA — booking wizard
   Placeholder catalogue below (marked TEST DATA) — swap in the
   real programmes/spaces and swap the mock slot generator for a
   live Cal.com embed once that's connected.
   ============================================================ */
(function () {
  'use strict';

  var root = document.querySelector('[data-wizard]');
  if (!root) return;

  /* ---- TEST DATA — replace with real programmes / spaces ---- */
  var CATALOGUE = {
    course: [
      {
        id: 'tamkeen',
        name: 'برنامج تمكين',
        desc: 'جلسة تعريفية لاكتشاف البرنامج قبل الالتحاق.',
        meta: '٦٠ دقيقة'
      }
    ],
    space: [
      {
        id: 'training-room',
        name: 'قاعة تكايا للتدريب',
        desc: 'قاعة مجهزة داخل مقر تكايا بمسقط.',
        meta: 'حتى ساعتين'
      }
    ]
  };

  var TYPE_LABEL = { course: 'برنامج', space: 'مساحة' };
  var TIME_SLOTS = ['09:00', '10:30', '12:00', '14:00', '16:00', '17:30'];
  var DOW_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function toArabicDigits(n) {
    return String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[d]; });
  }

  /* Deterministic pseudo-random so the same date always shows the
     same "booked" slots instead of flickering on re-render. */
  function seeded(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return function () { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
  }

  function workingDays(count) {
    var days = [];
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    while (days.length < count) {
      var dow = d.getDay();
      if (dow !== 5 && dow !== 6) { days.push(new Date(d)); }
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  var state = { step: 1, type: null, item: null, date: null, time: null };

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

  function fmtDate(d) {
    return d.toLocaleDateString('ar-OM', { weekday: 'long', day: 'numeric', month: 'long' });
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
    if (state.step === 3) ok = !!(state.date && state.time);
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

  function populateDays() {
    var days = workingDays(6);
    dayPickerEl.innerHTML = '';
    days.forEach(function (d, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-pill';
      btn.innerHTML =
        '<span class="dow">' + DOW_SHORT[d.getDay()] + '</span>' +
        '<span class="dom">' + toArabicDigits(d.getDate()) + '</span>';
      btn.addEventListener('click', function () {
        state.date = d;
        state.time = null;
        dayPickerEl.querySelectorAll('.day-pill').forEach(function (p) { p.classList.remove('selected'); });
        btn.classList.add('selected');
        populateSlots();
        updateNextEnabled();
      });
      dayPickerEl.appendChild(btn);
      if (i === 0) btn.click();
    });
    step3Sub.textContent = state.item ? state.item.name + ' — اختر الموعد الأنسب' : '';
  }

  function populateSlots() {
    slotGridEl.innerHTML = '';
    if (!state.date) return;
    var rand = seeded(state.date.toDateString());
    TIME_SLOTS.forEach(function (t) {
      var taken = rand() < 0.25;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = t;
      if (taken) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', function () {
          state.time = t;
          slotGridEl.querySelectorAll('.slot-btn').forEach(function (s) { s.classList.remove('selected'); });
          btn.classList.add('selected');
          updateNextEnabled();
        });
      }
      slotGridEl.appendChild(btn);
    });
  }

  function summaryRows() {
    return (
      '<dl>' +
      '<dt>النوع</dt><dd>' + TYPE_LABEL[state.type] + '</dd>' +
      '<dt>الاختيار</dt><dd>' + state.item.name + '</dd>' +
      '<dt>التاريخ</dt><dd>' + fmtDate(state.date) + '</dd>' +
      '<dt>الوقت</dt><dd class="ltr">' + state.time + '</dd>' +
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
    if (state.step === 3) populateDays();
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
      name: data.name,
      email: data.email,
      phone: data.phone,
      interest: state.item.name,
      format: state.type === 'course' ? 'حجز برنامج' : 'حجز مساحة',
      language: 'ar',
      message: 'حجز: ' + state.item.name + ' — ' + fmtDate(state.date) + ' الساعة ' + state.time
    };

    fetch('/api/enquiry', {
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
          throw new Error('failed');
        }
      })
      .catch(function () {
        submitStatus.textContent = 'تعذّر إرسال الحجز من هنا. راسلنا على واتساب أو بريدنا الإلكتروني وسنؤكد حجزك يدويًا.';
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
