/**
 * TestVerse - Landing Page (index.html)
 * Handles: sticky nav, mobile menu, smooth scrolling, scroll animations
 *
 * Dependencies (load in order):

 */

document.addEventListener('DOMContentLoaded', () => {

  // If already logged in, update nav to show dashboard link
  if (Auth.isLoggedIn()) {
    _updateNavForLoggedIn();
  }

  _initStickyNav();
  _initMobileMenu();
  _initSmoothScrollLinks();
  _initScrollAnimations();
  _initHeroCounters();
});

// ─── Nav: Sticky on Scroll ───────────────────────────────────────────────────

function _initStickyNav() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;

  const SCROLL_THRESHOLD = 50;

  const updateNav = () => {
    if (window.scrollY > SCROLL_THRESHOLD) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav(); // run once on load
}

// ─── Mobile Menu Toggle ──────────────────────────────────────────────────────

function _initMobileMenu() {
  const toggle = document.getElementById('mobileToggle');
  const menu   = document.getElementById('navMenu');
  if (!toggle || !menu) return;

  // landing.css uses .open on both nav-menu and mobile-menu-toggle
  const closeMenu = () => {
    menu.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Close on nav link click (mobile)
  menu.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      closeMenu();
    }
  });
}

// ─── Smooth Scrolling for Anchor Links ───────────────────────────────────────

function _initSmoothScrollLinks() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;

      e.preventDefault();
      const targetId = href.slice(1);
      UI.scrollToSection(`#${targetId}`, 80);

      // Update URL hash without jumping
      history.pushState(null, '', href);
    });
  });
}

// ─── Scroll-triggered Reveal Animations ──────────────────────────────────────

function _initScrollAnimations() {
  const animatables = document.querySelectorAll(
    '.feature-card, .step-item, .pricing-card, .section-header-center, .cta-content'
  );

  if (!animatables.length) return;

  // Add base class for animation
  animatables.forEach((el, i) => {
    el.classList.add('reveal');
    // Stagger children in grids
    el.style.transitionDelay = `${(i % 3) * 80}ms`;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  animatables.forEach((el) => observer.observe(el));
}

// ─── Hero Stats Counter Animation ────────────────────────────────────────────

function _initHeroCounters() {
  const statNumbers = document.querySelectorAll('.hero-stats .stat-number');
  if (!statNumbers.length) return;

  const animateCounter = (el) => {
    const target = el.textContent.trim();
    const num    = parseFloat(target.replace(/[^0-9.]/g, ''));
    const suffix = target.replace(/[0-9.]/g, '');

    if (isNaN(num)) return;

    const duration = 1500;
    const start    = performance.now();

    const tick = (now) => {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = Math.round(eased * num * 10) / 10;

      el.textContent = (Number.isInteger(num) ? Math.round(current) : current.toFixed(1)) + suffix;

      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  statNumbers.forEach((el) => observer.observe(el));
}

// ─── Update Nav for Logged-in Users ──────────────────────────────────────────

function _updateNavForLoggedIn() {
  const navActions = document.querySelector('.nav-actions');
  if (!navActions) return;

  const user = Auth.getUser();
  const dashUrl = Auth.isStaff() ? CONFIG.ROUTES.STAFF_DASH : CONFIG.ROUTES.STUDENT_DASH;
  const name    = user?.name?.split(' ')[0] || 'Account';

  navActions.innerHTML = `
    <a href="${dashUrl}" class="btn btn-ghost">Dashboard</a>
    <button class="btn btn-primary" id="navLogoutBtn">
      Hi, ${name} · Logout
    </button>
  `;

  document.getElementById('navLogoutBtn')?.addEventListener('click', Auth.logout);
}