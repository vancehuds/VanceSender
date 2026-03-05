/**
 * Help page interactions
 * - Back-to-top floating button
 * - TOC active-section highlight
 */

(function initHelpPage() {
    const tocLinks = Array.from(document.querySelectorAll('.toc-list a[href^="#"]'));
    const backToTopBtn = document.getElementById('back-to-top-btn');

    if (!tocLinks.length && !backToTopBtn) {
        return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sectionEntries = tocLinks
        .map((link) => {
            const rawHref = link.getAttribute('href') || '';
            const id = decodeURIComponent(rawHref.replace(/^#/, ''));
            const section = id ? document.getElementById(id) : null;
            if (!section) {
                return null;
            }

            return { id, link, section };
        })
        .filter(Boolean);

    if (!sectionEntries.length) {
        if (backToTopBtn) {
            backToTopBtn.addEventListener('click', () => {
                window.scrollTo({
                    top: 0,
                    behavior: prefersReducedMotion ? 'auto' : 'smooth'
                });
            });
        }
        return;
    }

    const sectionMap = new Map(sectionEntries.map((entry) => [entry.id, entry]));
    let activeId = '';
    let isTicking = false;

    function setActiveLink(targetId) {
        if (!targetId || targetId === activeId) {
            return;
        }

        activeId = targetId;
        sectionEntries.forEach(({ id, link }) => {
            link.classList.toggle('is-active', id === targetId);
            if (id === targetId) {
                link.setAttribute('aria-current', 'location');
                return;
            }
            link.removeAttribute('aria-current');
        });
    }

    function resolveCurrentSectionId() {
        const offsetY = window.scrollY + (window.innerHeight * 0.24);
        let currentId = sectionEntries[0].id;

        sectionEntries.forEach(({ id, section }) => {
            if (section.offsetTop <= offsetY) {
                currentId = id;
            }
        });

        return currentId;
    }

    function toggleBackToTopVisibility() {
        if (!backToTopBtn) {
            return;
        }
        backToTopBtn.classList.toggle('is-visible', window.scrollY > 360);
    }

    function syncOnScroll() {
        setActiveLink(resolveCurrentSectionId());
        toggleBackToTopVisibility();
    }

    function onScroll() {
        if (isTicking) {
            return;
        }

        isTicking = true;
        window.requestAnimationFrame(() => {
            syncOnScroll();
            isTicking = false;
        });
    }

    sectionEntries.forEach(({ id, link, section }) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            setActiveLink(id);
            section.scrollIntoView({
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
                block: 'start'
            });

            if (window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, '', `#${id}`);
            }
        });
    });

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: prefersReducedMotion ? 'auto' : 'smooth'
            });
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (hashId && sectionMap.has(hashId)) {
        setActiveLink(hashId);
    }

    syncOnScroll();
})();
