/* =============================================================
   chandrabindu interiors — interactions
   Every block is guarded, so each page only wires up what it has.
   ============================================================= */
(function () {
  'use strict';

  const $  = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------- header + mobile nav */
  const header = $('#header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const navToggle = $('#navToggle'), navLinks = $('#navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!open));
      navLinks.classList.toggle('is-open', !open);
    });
    // Close after tapping a link on mobile
    navLinks.addEventListener('click', e => {
      if (e.target.closest('a')) {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('is-open');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('is-open');
        navToggle.focus();
      }
    });
  }

  /* -------------------------------------------------------- scroll reveals */
  const revealables = $$('.reveal');
  if (revealables.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealables.forEach(el => el.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -60px' });
      revealables.forEach(el => io.observe(el));
    }
  }

  /* ------------------------------------------------------- counting numbers */
  const counters = $$('[data-count]');
  if (counters.length) {
    const run = el => {
      const target = Number(el.dataset.count) || 0;
      const suffix = el.dataset.suffix || '';
      if (reduceMotion) { el.textContent = target + suffix; return; }
      const dur = 1400, t0 = performance.now();
      const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);           // ease-out cubic
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) {
      counters.forEach(run);
    } else {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { run(entry.target); obs.unobserve(entry.target); }
        });
      }, { threshold: 0.5 });
      counters.forEach(el => io.observe(el));
    }
  }

  /* ------------------------------------------------------ before / after */
  const baStage = $('#baStage');
  if (baStage) {
    const range  = $('#baRange');
    const before = $('#baBefore'), after = $('#baAfter');
    const title  = $('#baTitle'),  desc  = $('#baDesc');

    const SETS = [
      {
        before: 'assets/img/before-living.svg', after: 'assets/img/after-living.svg',
        beforeAlt: 'The living room before renovation: bare grey walls and a single hanging bulb',
        afterAlt: 'The same living room after renovation: arch mural, teal sofa, dhurrie and warm lighting',
        title: 'Nivaasa Apartment, Delhi',
        desc: 'A 3BHK builder-shell turned into a warm, layered family home in 11 weeks.',
      },
      {
        before: 'assets/img/before-bedroom.svg', after: 'assets/img/after-bedroom.svg',
        beforeAlt: 'The bedroom before renovation: bare mattress on the floor and blank walls',
        afterAlt: 'The same bedroom after renovation: forest-green arch mural, upholstered headboard and bedside diyas',
        title: 'Sukoon Villa, Bengaluru',
        desc: 'The primary suite gained a hand-painted arch, deep storage and a reading corner.',
      },
      {
        before: 'assets/img/before-kitchen.svg', after: 'assets/img/after-kitchen.svg',
        beforeAlt: 'The kitchen before renovation: a bare concrete counter and unfinished walls',
        afterAlt: 'The same kitchen after renovation: mustard cabinetry, tiled backsplash and pendant lights',
        title: 'Rasoi Modular Kitchen, Ahmedabad',
        desc: 'A cramped galley reworked into a two-cook kitchen with a tiled backsplash and real storage.',
      },
    ];

    const afterLayer = $('.ba__layer--after', baStage);
    const divider    = $('.ba__divider', baStage);

    // Write the concrete properties alongside --pos so the handle position
    // never depends on custom-property invalidation reaching the subtree.
    const setPos = v => {
      const pct = v + '%';
      baStage.style.setProperty('--pos', pct);
      if (afterLayer) afterLayer.style.clipPath = 'inset(0 0 0 ' + pct + ')';
      if (divider) divider.style.left = pct;
    };
    setPos(range.value);
    range.addEventListener('input', () => setPos(range.value));

    $$('.ba-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const set = SETS[Number(tab.dataset.ba)];
        if (!set) return;
        $$('.ba-tab').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
        before.src = set.before; before.alt = set.beforeAlt;
        after.src  = set.after;  after.alt  = set.afterAlt;
        title.textContent = set.title;
        desc.textContent  = set.desc;
        range.value = 50; setPos(50);
      });
    });
  }

  /* -------------------------------------------------------- testimonials */
  const tst = $('#tst');
  if (tst) {
    const track = $('#tstTrack'), dotsBox = $('#tstDots');
    const slides = $$('.tst__slide', track);
    let index = 0, timer = null;

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'tst__dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Testimonial ' + (i + 1));
      dot.addEventListener('click', () => { go(i); restart(); });
      dotsBox.appendChild(dot);
    });
    const dots = $$('.tst__dot', dotsBox);

    function go(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = 'translateX(' + (-index * 100) + '%)';
      dots.forEach((d, k) => d.classList.toggle('is-active', k === index));
      slides.forEach((s, k) => s.setAttribute('aria-hidden', String(k !== index)));
    }
    const next = () => go(index + 1);
    const prev = () => go(index - 1);

    function restart() {
      clearInterval(timer);
      if (!reduceMotion) timer = setInterval(next, 6500);
    }

    $('#tstNext').addEventListener('click', () => { next(); restart(); });
    $('#tstPrev').addEventListener('click', () => { prev(); restart(); });
    tst.addEventListener('mouseenter', () => clearInterval(timer));
    tst.addEventListener('mouseleave', restart);
    tst.addEventListener('focusin', () => clearInterval(timer));

    // Swipe
    let startX = null;
    tst.addEventListener('pointerdown', e => { startX = e.clientX; });
    tst.addEventListener('pointerup', e => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 45) { dx < 0 ? next() : prev(); restart(); }
      startX = null;
    });

    go(0);
    restart();
  }

  /* ---------------------------------------------------------- FAQ accordion */
  const faqButtons = $$('.faq__q');
  faqButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq__item');
      const isOpen = item.classList.contains('is-open');
      // One panel at a time keeps the list scannable
      $$('.faq__item').forEach(other => {
        other.classList.remove('is-open');
        $('.faq__q', other).setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ------------------------------------------------------- portfolio filter */
  const filters = $$('.filter');
  if (filters.length) {
    filters.forEach(btn => {
      btn.addEventListener('click', () => {
        const want = btn.dataset.filter;
        filters.forEach(f => f.classList.toggle('is-active', f === btn));
        $$('.project[data-category]').forEach(card => {
          const show = want === 'all' || card.dataset.category === want;
          card.classList.toggle('is-hidden', !show);
        });
        const shown = $$('.project[data-category]:not(.is-hidden)').length;
        const empty = $('#portfolioEmpty');
        if (empty) empty.hidden = shown > 0;
      });
    });
  }

  /* ------------------------------------------------------------- lightbox */
  const lightbox = $('#lightbox');
  if (lightbox) {
    const lbImg   = $('#lbImg'),   lbTitle = $('#lbTitle');
    const lbMeta  = $('#lbMeta'),  lbDesc  = $('#lbDesc');
    const lbSpecs = $('#lbSpecs');
    let lastFocus = null;

    const open = card => {
      const d = card.dataset;
      const img = $('img', card);
      lbImg.src = img.getAttribute('src');
      lbImg.alt = img.getAttribute('alt');
      lbTitle.textContent = d.title;
      lbMeta.textContent  = d.category;
      lbDesc.textContent  = d.desc;
      lbSpecs.innerHTML =
        row('Location', d.location) + row('Area', d.area) +
        row('Scope', d.scope) + row('Timeline', d.timeline) + row('Completed', d.year);
      lastFocus = card;
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      $('#lbClose').focus();
    };
    const row = (k, v) => v ? '<li><span>' + k + '</span><span>' + v + '</span></li>' : '';

    const close = () => {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    };

    $$('.project[data-title]').forEach(card => card.addEventListener('click', () => open(card)));
    $('#lbClose').addEventListener('click', close);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && lightbox.classList.contains('is-open')) close();
    });
  }

  /* --------------------------------------------------------- contact form */
  const form = $('#contactForm');
  if (form) {
    const rules = {
      name:    v => v.trim().length >= 2        || 'Please tell us your name.',
      email:   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email address.',
      phone:   v => /^[0-9+\-\s()]{8,16}$/.test(v.trim()) || 'Please enter a valid phone number.',
      city:    v => v.trim().length >= 2        || 'Which city is the project in?',
      service: v => v !== ''                    || 'Please choose a service.',
      message: v => v.trim().length >= 10       || 'A sentence or two about the space, please.',
    };

    const fieldOf = input => input.closest('.field');
    const showError = (input, msg) => {
      const wrap = fieldOf(input);
      wrap.classList.toggle('is-invalid', Boolean(msg));
      const slot = $('.error', wrap);
      if (slot) slot.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };

    const validate = input => {
      const rule = rules[input.name];
      if (!rule) return true;
      const result = rule(input.value);
      showError(input, result === true ? '' : result);
      return result === true;
    };

    form.addEventListener('input', e => {
      // Only clear errors as the user types; don't nag before first submit
      if (fieldOf(e.target) && fieldOf(e.target).classList.contains('is-invalid')) validate(e.target);
    });
    form.addEventListener('blur', e => {
      if (rules[e.target.name]) validate(e.target);
    }, true);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const inputs = $$('[name]', form).filter(i => rules[i.name]);
      const bad = inputs.filter(i => !validate(i));

      if (bad.length) {
        bad[0].focus();
        bad[0].scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }

      // No backend on a static site — swap this for your form endpoint.
      const success = $('#formSuccess');
      form.hidden = true;
      success.hidden = false;
      success.setAttribute('tabindex', '-1');
      success.focus();
      success.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------------------------- highlight in-page nav target */
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    const target = document.getElementById(hash.slice(1));
    if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 60);
  }
})();
