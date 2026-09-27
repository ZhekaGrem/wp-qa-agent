(() => {
  const SR_ONLY = /(^|\s)(screen-reader-text|sr-only|visually-hidden|screen-reader-only)(\s|$)/;

  function cssPath(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 5; node = node.parentElement) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase() + [...node.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  }

  function isVisible(el) {
    const opts = { checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true };
    if (el.checkVisibility && !el.checkVisibility(opts)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function isHiddenFromUsers(el) {
    return Boolean(el.closest('[aria-hidden="true"],[inert]'));
  }

  function isSrOnly(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (typeof n.className === 'string' && SR_ONLY.test(n.className)) return true;
      const s = getComputedStyle(n);
      if (s.clip && s.clip !== 'auto') return true;
      if (s.clipPath && s.clipPath.startsWith('inset(50%')) return true;
    }
    return false;
  }

  function inFixedLayer(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  }

  // Clipped or scrolled by an ancestor other than html/body (carousels, scroll areas).
  function contained(el) {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== 'visible') return true;
    }
    return false;
  }

  function probeOverflow() {
    const vw = document.documentElement.clientWidth;
    const culprits = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width < 2 || r.height < 2) continue;
      if (isHiddenFromUsers(el) || inFixedLayer(el) || contained(el) || !isVisible(el)) continue;
      if (culprits.some((c) => c.contains(el))) continue;
      culprits.push(el);
      if (culprits.length >= 3) break;
    }
    return culprits.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: 'VIS-OVERFLOW-X', severity: 'medium',
        message: `Element extends ${Math.round(r.right - vw)}px beyond the ${vw}px viewport`,
        selector: cssPath(el), match: '',
        evidence: `right=${Math.round(r.right)} viewport=${vw} scrollWidth=${document.documentElement.scrollWidth}`,
      };
    });
  }

  function probeImages() {
    const out = [];
    for (const img of document.images) {
      if (isHiddenFromUsers(img)) continue;
      const src = img.currentSrc || img.src || '';
      if (!src) continue;
      if (img.complete && img.naturalWidth === 0 && !/\.svg(\?|#|$)/i.test(src)) {
        out.push({ id: 'VIS-IMG-BROKEN', severity: 'medium', message: 'Image failed to load', selector: cssPath(img), match: '', evidence: src });
        continue;
      }
      const r = img.getBoundingClientRect();
      if (!img.naturalWidth || r.width < 20 || r.height < 20 || !isVisible(img)) continue;
      if (getComputedStyle(img).objectFit !== 'fill') continue;
      const natural = img.naturalWidth / img.naturalHeight;
      const drift = Math.abs(r.width / r.height - natural) / natural;
      if (drift > 0.05) {
        out.push({
          id: 'VIS-IMG-DISTORTED', severity: 'low', message: `Image aspect ratio distorted by ${Math.round(drift * 100)}%`,
          selector: cssPath(img), match: '', evidence: `natural ${img.naturalWidth}x${img.naturalHeight}, rendered ${Math.round(r.width)}x${Math.round(r.height)}`,
        });
      }
    }
    return out;
  }

  function hasOwnText(el) {
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  }

  function probeClipped() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!hasOwnText(el)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'inline') continue;
      const clipsX = s.overflowX === 'hidden' || s.overflowX === 'clip';
      const clipsY = s.overflowY === 'hidden' || s.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      if (s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) continue;
      if (isSrOnly(el) || isHiddenFromUsers(el) || !isVisible(el)) continue;
      const overX = clipsX && el.scrollWidth > el.clientWidth + 1;
      const overY = clipsY && el.scrollHeight > el.clientHeight + 1;
      if (!overX && !overY) continue;
      out.push({
        id: 'VIS-TEXT-CLIPPED', severity: 'medium', message: 'Text is cut off by its container', selector: cssPath(el), match: '',
        evidence: `${el.textContent.trim().slice(0, 80)} (content ${el.scrollWidth}x${el.scrollHeight} > box ${el.clientWidth}x${el.clientHeight})`,
      });
      if (out.length >= 10) break;
    }
    return out;
  }

  function probeEmptyControls() {
    const out = [];
    for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
      if (isHiddenFromUsers(el) || !isVisible(el)) continue;
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || '').trim();
      if (name || el.getAttribute('aria-labelledby')) continue;
      const labelled = [...el.querySelectorAll('img[alt], svg title, [aria-label]')]
        .some((n) => (n.getAttribute('alt') || n.getAttribute('aria-label') || n.textContent || '').trim());
      if (labelled) continue;
      out.push({ id: 'TXT-EMPTY-CONTROL', severity: 'low', message: 'Link or button has no visible or accessible text', selector: cssPath(el), match: '', evidence: el.outerHTML.slice(0, 120) });
      if (out.length >= 20) break;
    }
    return out;
  }

  async function probeOverlap() {
    const out = [];
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const checked = new Set();
    const controls = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]')]
      .filter((el) => !isHiddenFromUsers(el) && !inFixedLayer(el) && !isSrOnly(el) && isVisible(el));
    const height = document.documentElement.scrollHeight;
    for (let y = 0, i = 0; y < height && i < 60 && out.length < 10; y += vh, i++) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      for (const el of controls) {
        if (checked.has(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
        checked.add(el);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || el.contains(hit) || hit.contains(el)) continue;
        if (hit.closest('label') && hit.closest('label').control === el) continue;
        if (inFixedLayer(hit)) continue;
        out.push({ id: 'VIS-OVERLAP', severity: 'medium', message: 'Interactive element is covered by another element', selector: cssPath(el), match: '', evidence: `covered by ${cssPath(hit)}` });
        if (out.length >= 10) break;
      }
    }
    window.scrollTo(0, 0);
    return out;
  }

  function collectTextBlocks() {
    const groups = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,template,svg') || isHiddenFromUsers(parent)) continue;
      if (isSrOnly(parent) || !isVisible(parent)) continue;
      let block = parent;
      while (block.parentElement && block !== document.body && getComputedStyle(block).display === 'inline') block = block.parentElement;
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push(text);
    }
    return [...groups].slice(0, 2000).map(([el, parts]) => ({ selector: cssPath(el), text: parts.join(' ') }));
  }

  function collectLinks() {
    const set = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.href.startsWith(location.origin)) set.add(a.href.split('#')[0]);
    }
    return [...set];
  }

  window.__wpqa = {
    async run() {
      const meta = {
        lang: document.documentElement.lang || '',
        title: document.title,
        isWpDie: document.body.id === 'error-page',
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
      const blocks = collectTextBlocks();
      const links = collectLinks();
      const detections = [...probeOverflow(), ...probeImages(), ...probeClipped(), ...probeEmptyControls(), ...(await probeOverlap())];
      if (meta.isWpDie) {
        detections.unshift({ id: 'TXT-PHP-ERROR', severity: 'high', message: 'WordPress error page (wp_die) is shown', selector: 'body#error-page', match: '', evidence: document.body.innerText.slice(0, 160) });
      }
      return { meta, detections, blocks, links };
    },
  };
})();
