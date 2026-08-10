/* ============================================================
   TAKAYA — site behaviour
   ============================================================ */
(function () {
  'use strict';

  /* JS is running — enable the reveal animation's hidden start state */
  document.documentElement.classList.add('js');

  /* ---- Mobile nav ---- */
  var toggle = document.querySelector('.nav-toggle');
  var links  = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      links.classList.toggle('open', !open);
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        toggle.setAttribute('aria-expanded', 'false');
        links.classList.remove('open');
      }
    });
  }

  /* ---- Header shadow on scroll ---- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Scroll reveal ---- */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i % 4, 3) * 70 + 'ms';
        io.observe(el);
      });
    } else {
      revealEls.forEach(function (el) { el.classList.add('in'); });
    }
  }

  /* ---- Animated stat counters ---- */
  var statEls = document.querySelectorAll('.stat-num');
  if (statEls.length) {
    var arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var toArabicDigits = function (str) {
      return str.replace(/[0-9]/g, function (d) { return arabicDigits[d]; });
    };

    var parseStat = function (el) {
      var raw = el.textContent.trim();
      var isArabic = /[٠-٩]/.test(raw);
      var westernised = raw.replace(/[٠-٩]/g, function (d) {
        return String(arabicDigits.indexOf(d));
      });
      var match = westernised.match(/(\+?)(\d+)(\+?)/);
      if (!match) return null;
      return {
        value: parseInt(match[2], 10),
        prefixPlus: match[1] === '+',
        suffixPlus: match[3] === '+',
        isArabic: isArabic
      };
    };

    var formatStat = function (n, meta) {
      var s = String(n);
      if (meta.isArabic) s = toArabicDigits(s);
      if (meta.prefixPlus) s = '+' + s;
      if (meta.suffixPlus) s = s + '+';
      return s;
    };

    var animateStat = function (el, meta) {
      var duration = 1100;
      var start = null;
      var step = function (ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = formatStat(Math.round(eased * meta.value), meta);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = formatStat(meta.value, meta);
        }
      };
      requestAnimationFrame(step);
    };

    var stats = [];
    statEls.forEach(function (el) {
      var meta = parseStat(el);
      if (!meta) return;
      if (!reduceMotion) el.textContent = formatStat(0, meta);
      stats.push({ el: el, meta: meta });
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      stats.forEach(function (s) { s.el.textContent = formatStat(s.meta.value, s.meta); });
    } else if (stats.length) {
      var statIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var match = stats.filter(function (s) { return s.el === entry.target; })[0];
          if (match) animateStat(match.el, match.meta);
          statIO.unobserve(entry.target);
        });
      }, { threshold: 0.4 });
      stats.forEach(function (s) { statIO.observe(s.el); });
    }
  }

  /* ---- Accordions ---- */
  document.querySelectorAll('.acc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.nextElementSibling;
      var open  = btn.getAttribute('aria-expanded') === 'true';

      // close siblings within the same accordion group
      var group = btn.closest('.accordion');
      if (group && !open) {
        group.querySelectorAll('.acc-btn[aria-expanded="true"]').forEach(function (other) {
          other.setAttribute('aria-expanded', 'false');
          other.nextElementSibling.style.maxHeight = null;
        });
      }

      btn.setAttribute('aria-expanded', String(!open));
      panel.style.maxHeight = open ? null : panel.scrollHeight + 'px';
    });
  });

  /* ---- Course filters ---- */
  var filterBar = document.querySelector('.filters');
  if (filterBar) {
    filterBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBar.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });

      var cat = btn.dataset.filter;
      var shown = 0;
      document.querySelectorAll('[data-category]').forEach(function (card) {
        var match = cat === 'all' || card.dataset.category === cat;
        card.style.display = match ? '' : 'none';
        if (match) shown++;
      });

      var empty = document.querySelector('.no-results');
      if (empty) empty.style.display = shown ? 'none' : '';
    });
  }

  /* ---- Enquiry form ---- */
  document.querySelectorAll('form[data-enquiry]').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');

    function say(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.classList.add('show');
      status.classList.toggle('error', kind === 'error');
      status.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function markInvalid(fields) {
      form.querySelectorAll('.field.invalid').forEach(function (f) {
        f.classList.remove('invalid');
      });
      Object.keys(fields || {}).forEach(function (name) {
        var input = form.querySelector('[name="' + name + '"]');
        if (input && input.closest('.field')) input.closest('.field').classList.add('invalid');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      markInvalid(null);

      var data = Object.fromEntries(new FormData(form).entries());

      // Basic client-side check so people get instant feedback.
      var clientErrors = {};
      if (!data.name || data.name.trim().length < 2) clientErrors.name = true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email || '')) clientErrors.email = true;
      if (Object.keys(clientErrors).length) {
        markInvalid(clientErrors);
        say('يرجى التحقق من الاسم والبريد الإلكتروني ثم المحاولة مرة أخرى.', 'error');
        return;
      }

      if (button) {
        button.disabled = true;
        button.textContent = 'جارٍ الإرسال…';
      }

      fetch(form.getAttribute('action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (r) {
          if (r.ok && r.body.ok) {
            say('شكرًا لك — وصلنا استفسارك، وسنردّ عليك خلال يوم عمل واحد، من الأحد إلى الخميس.');
            form.reset();
          } else if (r.status === 422 && r.body.errors) {
            markInvalid(r.body.errors);
            say(Object.values(r.body.errors).join(' '), 'error');
          } else {
            throw new Error(r.body.error || 'Request failed');
          }
        })
        .catch(function () {
          // Happens when previewing the file locally, or if the network drops.
          // Never leave someone with a dead form — give them a direct route.
          say(
            'تعذّر الإرسال من هنا. راسلنا على takayaoman@gmail.com أو عبر واتساب وسنتابع طلبك مباشرة.',
            'error'
          );
        })
        .then(function () {
          if (button) {
            button.disabled = false;
            button.textContent = button.dataset.label || 'أرسل الاستفسار';
          }
        });
    });
  });

  /* ---- Prefill enquiry subject ---- */
  var setInterest = function (value) {
    var sel = document.querySelector('#interest');
    if (!sel || !value) return;
    var matched = Array.prototype.some.call(sel.options, function (opt) {
      if (opt.value.toLowerCase() === value.toLowerCase()) {
        sel.value = opt.value;
        return true;
      }
      return false;
    });
    if (!matched) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      sel.appendChild(opt);
      sel.value = value;
    }
  };

  /* from ?course= / ?package= / ?interest= in the URL */
  var params = new URLSearchParams(window.location.search);
  setInterest(params.get('course') || params.get('package') || params.get('interest'));

  /* from "استفسر الآن" links that jump to the contact section */
  document.querySelectorAll('a[data-interest]').forEach(function (link) {
    link.addEventListener('click', function () {
      setInterest(link.getAttribute('data-interest'));
    });
  });

  /* ---- Footer year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
