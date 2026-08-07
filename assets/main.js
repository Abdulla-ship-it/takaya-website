/* ============================================================
   TAKAYA — site behaviour
   ============================================================ */
(function () {
  'use strict';

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
        say('Please check your name and email address, then try again.', 'error');
        return;
      }

      if (button) {
        button.disabled = true;
        button.textContent = 'Sending…';
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
            say('Thank you — your enquiry has been received. We reply within one working day, Sunday to Thursday.');
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
            'We could not send that from here. Please email hello@takaya.om or message us on WhatsApp and we will pick it up straight away.',
            'error'
          );
        })
        .then(function () {
          if (button) {
            button.disabled = false;
            button.textContent = button.dataset.label || 'Send enquiry';
          }
        });
    });
  });

  /* ---- Prefill enquiry subject from ?course= or ?package= ---- */
  var params = new URLSearchParams(window.location.search);
  var interest = params.get('course') || params.get('package');
  if (interest) {
    var sel = document.querySelector('#interest');
    if (sel) {
      var matched = Array.prototype.some.call(sel.options, function (opt) {
        if (opt.value.toLowerCase() === interest.toLowerCase()) {
          sel.value = opt.value;
          return true;
        }
        return false;
      });
      if (!matched) {
        var opt = document.createElement('option');
        opt.value = interest;
        opt.textContent = interest;
        sel.appendChild(opt);
        sel.value = interest;
      }
    }
  }

  /* ---- Footer year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
