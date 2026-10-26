/*!
 * rsnl-a11y-v1.js — RSNL Creative accessibility library
 * Version 1.0.0
 *
 * Fourteen modules that close the WCAG 2.2 AA failures a visual page builder
 * cannot express. Platform-agnostic: Webflow, WordPress and Shopify all load
 * the same file. No dependencies, no jQuery, no build step.
 *
 * SAFE BY DEFAULT. Every module:
 *   - is a no-op when its markup is absent
 *   - never overwrites an attribute an author already set
 *   - never changes visible text, layout, or color
 *   - fails silently per-module, so one bad selector cannot take down the rest
 *
 * Load in the FOOTER, deferred. It needs the DOM.
 * Never load it on a Shopify checkout surface.
 *
 * Opt a single element out of any module with data-a11y-skip.
 * Opt a whole page out with data-a11y-off on <html> or <body>.
 */
(function (window, document) {
  "use strict";

  var VERSION = "1.0.0";
  var NS = "rsnl-a11y";

  if (window.__rsnlA11y) { return; }                    // already loaded
  var root = document.documentElement;
  if (root.hasAttribute("data-a11y-off") ||
      (document.body && document.body.hasAttribute("data-a11y-off"))) { return; }

  /* ----------------------------------------------------------------------
   * helpers
   * -------------------------------------------------------------------- */

  var uid = 0;
  function nextId(prefix) {
    uid += 1;
    return prefix + "-" + NS + "-" + uid;
  }

  function qsa(sel, ctx) {
    try { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
    catch (e) { return []; }
  }

  function skip(el) {
    return !el || el.hasAttribute("data-a11y-skip") || el.closest("[data-a11y-skip]") !== null;
  }

  /* Set an attribute only if the author has not. Never clobber intent. */
  function softSet(el, name, value) {
    if (!el || el.hasAttribute(name)) { return false; }
    el.setAttribute(name, value);
    return true;
  }

  function ensureId(el, prefix) {
    if (!el.id) { el.id = nextId(prefix || "el"); }
    return el.id;
  }

  /* Does this element already have an accessible name? Cheap approximation:
     enough to avoid double-labelling, not a full accname computation. */
  function hasName(el) {
    if (el.getAttribute("aria-label")) { return true; }
    if (el.getAttribute("aria-labelledby")) { return true; }
    if (el.getAttribute("title")) { return true; }
    if ((el.textContent || "").trim()) { return true; }
    var img = el.querySelector("img[alt]");
    if (img && img.getAttribute("alt").trim()) { return true; }
    var svgTitle = el.querySelector("svg > title");
    if (svgTitle && (svgTitle.textContent || "").trim()) { return true; }
    return false;
  }

  var FOCUSABLE = [
    "a[href]", "area[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])", "textarea:not([disabled])", "iframe", "object", "embed",
    "audio[controls]", "video[controls]", "summary",
    "[tabindex]:not([tabindex^='-'])", "[contenteditable='true']"
  ].join(",");

  function focusable(ctx) {
    return qsa(FOCUSABLE, ctx).filter(function (el) {
      if (el.hasAttribute("inert") || el.closest("[inert]")) { return false; }
      if (el.getAttribute("aria-hidden") === "true") { return false; }
      // offsetParent is null for display:none; also covers most visually-hidden cases
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    });
  }

  function trapFocus(container, event) {
    var items = focusable(container);
    if (!items.length) { event.preventDefault(); return; }
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* A visually-hidden live region, created once, shared by every module
     that needs to announce something. */
  var announcer = null;
  function announce(message, assertive) {
    if (!message) { return; }
    if (!announcer) {
      announcer = document.createElement("div");
      announcer.setAttribute("aria-live", "polite");
      announcer.setAttribute("aria-atomic", "true");
      announcer.className = NS + "-announcer";
      announcer.style.cssText =
        "position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;" +
        "overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";
      document.body.appendChild(announcer);
    }
    announcer.setAttribute("aria-live", assertive ? "assertive" : "polite");
    // Clearing first forces assistive tech to re-read an identical message.
    announcer.textContent = "";
    window.setTimeout(function () { announcer.textContent = message; }, 50);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ----------------------------------------------------------------------
   * module 1 — skip link
   *
   * A skip link that moves the viewport but not FOCUS is not a skip link.
   * Browsers historically do not move focus on same-page anchors to a
   * non-focusable target, so set tabindex="-1" on the target and focus it.
   * -------------------------------------------------------------------- */

  function skipLink() {
    var links = qsa('a[href^="#"]').filter(function (a) {
      if (skip(a)) { return false; }
      if (a.hasAttribute("data-a11y-skiplink")) { return true; }
      var text = (a.textContent || "").trim().toLowerCase();
      return text.indexOf("skip to") === 0 || a.classList.contains("skip-link");
    });

    links.forEach(function (a) {
      a.addEventListener("click", function () {
        var id = a.getAttribute("href").slice(1);
        if (!id) { return; }
        var target = document.getElementById(id);
        if (!target) { return; }
        if (!target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
          // Remove it again on blur so the target never joins the tab order.
          target.addEventListener("blur", function handler() {
            target.removeAttribute("tabindex");
            target.removeEventListener("blur", handler);
          });
        }
        target.focus({ preventScroll: false });
      });
    });

    return links.length;
  }

  /* ----------------------------------------------------------------------
   * module 2 — landmarks
   *
   * Only fills genuine gaps. If the page already has a <main> or role=main
   * this does nothing at all. Page builders that emit div soup get the
   * minimum needed for landmark navigation to work.
   * -------------------------------------------------------------------- */

  function landmarks() {
    var n = 0;

    if (!document.querySelector("main, [role=main]")) {
      var candidate = document.querySelector("[data-a11y-main]") ||
                      document.getElementById("main") ||
                      document.getElementById("main-content");
      if (candidate && !skip(candidate)) {
        softSet(candidate, "role", "main");
        n += 1;
      }
    }

    // A second nav with no name is unnavigable — name them positionally.
    var navs = qsa("nav, [role=navigation]").filter(function (el) { return !skip(el); });
    if (navs.length > 1) {
      navs.forEach(function (nav) {
        if (hasName(nav)) { return; }
        var inFooter = !!nav.closest("footer, [role=contentinfo]");
        var inHeader = !!nav.closest("header, [role=banner]");
        var label = inFooter ? "Footer" : (inHeader ? "Primary" : "Secondary");
        nav.setAttribute("aria-label", label);
        n += 1;
      });
    }

    return n;
  }

  /* ----------------------------------------------------------------------
   * module 3 — div-as-button        [data-a11y-button]
   *
   * Webflow has no native <button>; its Button element renders as
   * <a href="#">, which fires on Enter but NOT on Space. Divs styled as
   * buttons do neither. This gives both keys, a role, and a tab stop.
   * -------------------------------------------------------------------- */

  function divButton() {
    var els = qsa("[data-a11y-button]").filter(function (el) { return !skip(el); });

    els.forEach(function (el) {
      var tag = el.tagName.toLowerCase();
      var isNative = tag === "button" || (tag === "input" && /^(button|submit|reset)$/i.test(el.type));
      if (!isNative) {
        softSet(el, "role", "button");
        if (!el.hasAttribute("tabindex")) { el.setAttribute("tabindex", "0"); }
      }

      var value = el.getAttribute("data-a11y-button");
      if (value && value !== "true" && !hasName(el)) {
        el.setAttribute("aria-label", value);
      }

      // An anchor already activates on Enter; adding Space is the fix.
      // A div needs both.
      if (el.__rsnlKeys) { return; }
      el.__rsnlKeys = true;
      el.addEventListener("keydown", function (e) {
        var isEnter = e.key === "Enter";
        var isSpace = e.key === " " || e.key === "Spacebar";
        if (!isEnter && !isSpace) { return; }
        if (isSpace) { e.preventDefault(); }       // stop the page scrolling
        if (tag === "a" && isEnter) { return; }    // native, leave it alone
        e.preventDefault();
        el.click();
      });
    });

    return els.length;
  }

  /* ----------------------------------------------------------------------
   * module 4 — accordions          [data-a11y-accordion]
   *
   * Put the attribute on the wrapper. Trigger and panel are found by
   * data-a11y-accordion-trigger / -panel, or by first/second child.
   * -------------------------------------------------------------------- */

  function accordion() {
    var groups = qsa("[data-a11y-accordion]").filter(function (el) { return !skip(el); });

    groups.forEach(function (group) {
      var trigger = group.querySelector("[data-a11y-accordion-trigger]") ||
                    group.querySelector("a, button, [role=button]") ||
                    group.firstElementChild;
      var panel = group.querySelector("[data-a11y-accordion-panel]") ||
                  (trigger && trigger.nextElementSibling);
      if (!trigger || !panel) { return; }

      var tag = trigger.tagName.toLowerCase();
      if (tag !== "button") {
        softSet(trigger, "role", "button");
        if (!trigger.hasAttribute("tabindex")) { trigger.setAttribute("tabindex", "0"); }
      }
      softSet(trigger, "aria-controls", ensureId(panel, "acc-panel"));
      softSet(trigger, "aria-expanded", "false");
      ensureId(trigger, "acc-trigger");
      softSet(panel, "role", "region");
      softSet(panel, "aria-labelledby", trigger.id);

      function sync() {
        // The builder owns the open/closed state; read it, don't set it.
        var open = group.classList.contains("w--open") ||
                   group.classList.contains("is-open") ||
                   group.getAttribute("data-open") === "true" ||
                   (panel.offsetHeight > 0 && getComputedStyle(panel).display !== "none");
        trigger.setAttribute("aria-expanded", open ? "true" : "false");
      }

      trigger.addEventListener("click", function () { window.setTimeout(sync, 60); });
      trigger.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); trigger.click(); }
      });

      if (window.MutationObserver) {
        try {
          new MutationObserver(sync).observe(group, {
            attributes: true, attributeFilter: ["class", "style", "data-open"], subtree: true
          });
        } catch (e) { /* observer unavailable, click handler still syncs */ }
      }

      sync();
    });

    return groups.length;
  }

  /* ----------------------------------------------------------------------
   * module 5 — dialogs: lightbox and modal   [data-a11y-dialog]
   *
   * Also auto-detects Webflow's native lightbox, which ships with no
   * role=dialog, no accessible name, generic iframe titles and no focus trap.
   * -------------------------------------------------------------------- */

  function dialog() {
    var dialogs = qsa("[data-a11y-dialog], .w-lightbox-backdrop")
      .filter(function (el) { return !skip(el); });

    dialogs.forEach(function (el) {
      if (el.__rsnlDialog) { return; }
      el.__rsnlDialog = true;

      softSet(el, "role", "dialog");
      softSet(el, "aria-modal", "true");

      if (!hasName(el)) {
        var label = el.getAttribute("data-a11y-dialog");
        var heading = el.querySelector("h1, h2, h3, [data-a11y-dialog-title]");
        if (label && label !== "true") {
          el.setAttribute("aria-label", label);
        } else if (heading) {
          el.setAttribute("aria-labelledby", ensureId(heading, "dlg-title"));
        } else {
          el.setAttribute("aria-label", "Dialog");
        }
      }

      // Webflow's lightbox iframes carry no title, so a screen reader
      // announces only "iframe".
      qsa("iframe", el).forEach(function (frame) {
        softSet(frame, "title", "Embedded media");
      });

      var opener = null;

      el.addEventListener("keydown", function (e) {
        if (e.key === "Tab") { trapFocus(el, e); return; }
        if (e.key === "Escape" || e.key === "Esc") {
          var close = el.querySelector("[data-a11y-dialog-close], .w-lightbox-close");
          if (close) { close.click(); }
        }
      });

      if (window.MutationObserver) {
        try {
          new MutationObserver(function () {
            var open = el.offsetParent !== null && getComputedStyle(el).display !== "none";
            if (open && !el.__rsnlOpen) {
              el.__rsnlOpen = true;
              opener = document.activeElement;
              var first = focusable(el)[0];
              if (first) { window.setTimeout(function () { first.focus(); }, 30); }
            } else if (!open && el.__rsnlOpen) {
              el.__rsnlOpen = false;
              if (opener && document.contains(opener)) { opener.focus(); }
            }
          }).observe(el, { attributes: true, attributeFilter: ["style", "class"] });
        } catch (e) { /* no observer; trap and Escape still work */ }
      }
    });

    return dialogs.length;
  }

  /* ----------------------------------------------------------------------
   * module 6 — form labels and descriptions
   *
   * A placeholder is not a label. It disappears on focus and is read
   * inconsistently. Promote it to aria-label only when there is no real one.
   * -------------------------------------------------------------------- */

  function formLabels() {
    var fields = qsa("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea")
      .filter(function (el) { return !skip(el); });
    var fixed = 0;

    fields.forEach(function (field) {
      var labelled = false;

      if (field.id && document.querySelector('label[for="' + CSS_escape(field.id) + '"]')) { labelled = true; }
      if (!labelled && field.closest("label")) { labelled = true; }
      if (!labelled && (field.getAttribute("aria-label") || field.getAttribute("aria-labelledby"))) { labelled = true; }

      if (!labelled) {
        var text = field.getAttribute("placeholder") ||
                   field.getAttribute("data-a11y-label") ||
                   field.getAttribute("name") ||
                   field.getAttribute("title");
        // Webflow ships "Example Text" as a default placeholder. Never use it.
        if (text && !/^example text$/i.test(text)) {
          field.setAttribute("aria-label", humanise(text));
          fixed += 1;
        }
      }

      if (field.required || field.getAttribute("aria-required") === "true") {
        softSet(field, "aria-required", "true");
      }

      var help = field.getAttribute("data-a11y-describedby");
      if (help) {
        var helpEl = document.getElementById(help) || document.querySelector(help);
        if (helpEl) { softSet(field, "aria-describedby", ensureId(helpEl, "help")); }
      }
    });

    return fixed;
  }

  function humanise(text) {
    return String(text)
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, function (c) { return c.toUpperCase(); });
  }

  /* CSS.escape is unavailable in older Safari. */
  function CSS_escape(value) {
    if (window.CSS && window.CSS.escape) { return window.CSS.escape(value); }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  /* ----------------------------------------------------------------------
   * module 7 — form errors
   *
   * Browser-native HTML5 validation is transient and not programmatically
   * associated with the field. On an invalid submit: mark the fields,
   * announce the count, and move focus to the first bad one.
   *
   * Never disables the submit button — a disabled button cannot be focused
   * and gives a keyboard user no way to find out what is wrong.
   * -------------------------------------------------------------------- */

  function formErrors() {
    var forms = qsa("form").filter(function (el) { return !skip(el); });

    forms.forEach(function (form) {
      if (form.__rsnlErrors) { return; }
      form.__rsnlErrors = true;

      form.addEventListener("submit", function () {
        qsa("[aria-invalid=true]", form).forEach(function (f) {
          f.removeAttribute("aria-invalid");
        });
      });

      form.addEventListener("invalid", function (e) {
        var field = e.target;
        if (!field || skip(field)) { return; }
        field.setAttribute("aria-invalid", "true");

        var message = field.validationMessage;
        if (message) {
          var box = form.querySelector('[data-a11y-error-for="' + CSS_escape(field.name || field.id) + '"]');
          if (box) {
            box.textContent = message;
            softSet(box, "role", "alert");
            var described = field.getAttribute("aria-describedby");
            var boxId = ensureId(box, "err");
            if (!described || described.indexOf(boxId) === -1) {
              field.setAttribute("aria-describedby", described ? described + " " + boxId : boxId);
            }
          }
        }

        if (!form.__rsnlPending) {
          form.__rsnlPending = true;
          window.setTimeout(function () {
            form.__rsnlPending = false;
            var bad = qsa("[aria-invalid=true]", form);
            if (!bad.length) { return; }
            announce(bad.length === 1
              ? "There is 1 problem with this form."
              : "There are " + bad.length + " problems with this form.", true);
            try { bad[0].focus(); } catch (err) { /* field may be hidden */ }
          }, 0);
        }
      }, true);   // capture: 'invalid' does not bubble
    });

    return forms.length;
  }

  /* ----------------------------------------------------------------------
   * module 8 — form status          (.w-form-done / .w-form-fail)
   *
   * Webflow swaps these blocks in on submit with no live region, so a
   * screen reader user never learns the form succeeded or failed.
   * -------------------------------------------------------------------- */

  function formStatus() {
    var done = qsa(".w-form-done, [data-a11y-status=success]").filter(function (el) { return !skip(el); });
    var fail = qsa(".w-form-fail, [data-a11y-status=error]").filter(function (el) { return !skip(el); });

    done.forEach(function (el) {
      softSet(el, "role", "status");
      softSet(el, "aria-live", "polite");
    });
    fail.forEach(function (el) {
      softSet(el, "role", "alert");
      softSet(el, "aria-live", "assertive");
    });

    return done.length + fail.length;
  }

  /* ----------------------------------------------------------------------
   * module 9 — filtered results      [data-a11y-results]
   *
   * A sighted user watches the result count change. Without this, a screen
   * reader user gets nothing: no announcement that filtering happened, how
   * many results there are, or that the list changed.
   *
   * Put the attribute on the results container. Optional value is the noun:
   *   data-a11y-results="listings"  ->  "12 listings"
   * -------------------------------------------------------------------- */

  function results() {
    var regions = qsa("[data-a11y-results]").filter(function (el) { return !skip(el); });

    regions.forEach(function (region) {
      if (region.__rsnlResults) { return; }
      region.__rsnlResults = true;

      softSet(region, "aria-live", "polite");
      softSet(region, "aria-atomic", "false");
      softSet(region, "aria-busy", "false");

      var noun = region.getAttribute("data-a11y-results");
      if (!noun || noun === "true") { noun = "results"; }

      var itemSelector = region.getAttribute("data-a11y-results-item") ||
                         ".w-dyn-item, [role=listitem], li";
      var last = qsa(itemSelector, region).length;
      var timer = null;

      if (!window.MutationObserver) { return; }
      try {
        new MutationObserver(function () {
          window.clearTimeout(timer);
          timer = window.setTimeout(function () {
            var now = qsa(itemSelector, region).length;
            if (now === last) { return; }
            last = now;
            var empty = region.querySelector(".w-dyn-empty, [data-a11y-results-empty]");
            if (now === 0 || (empty && empty.offsetParent !== null)) {
              announce("No " + noun + " found. Try changing your filters.");
            } else {
              announce(now + " " + (now === 1 ? noun.replace(/s$/, "") : noun) + " found.");
            }
          }, 250);   // debounce: filters often fire several mutations
        }).observe(region, { childList: true, subtree: true });
      } catch (e) { /* no announcements, page still works */ }
    });

    return regions.length;
  }

  /* ----------------------------------------------------------------------
   * module 10 — canvas maps          [data-a11y-map]
   *
   * A WebGL canvas is invisible to assistive tech by construction. The list
   * view beside it IS the accessible path — but nothing says so, and nothing
   * links the two. Hide the canvas, name the list as the equivalent.
   *
   *   data-a11y-map="#listings"   ->  the element that is the alternative
   * -------------------------------------------------------------------- */

  function maps() {
    var els = qsa("[data-a11y-map]").filter(function (el) { return !skip(el); });

    els.forEach(function (el) {
      var altSelector = el.getAttribute("data-a11y-map");
      var alt = null;
      if (altSelector && altSelector !== "true") {
        try { alt = document.querySelector(altSelector); } catch (e) { alt = null; }
      }

      // Hide the visual map from assistive tech and from the tab order.
      el.setAttribute("aria-hidden", "true");
      qsa(FOCUSABLE, el).forEach(function (f) { f.setAttribute("tabindex", "-1"); });

      var note = document.createElement("p");
      note.className = NS + "-sr";
      note.style.cssText =
        "position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;" +
        "overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";

      if (alt) {
        softSet(alt, "role", "region");
        if (!hasName(alt)) { alt.setAttribute("aria-label", "Results list"); }
        note.textContent =
          "An interactive map is shown here. The same locations are available as a " +
          "list, which follows this message.";
      } else {
        note.textContent =
          "An interactive map is shown here. It is not available to screen readers. " +
          "Please use the search and filter controls, or contact us for help.";
      }

      if (el.parentNode) { el.parentNode.insertBefore(note, el); }
    });

    return els.length;
  }

  /* ----------------------------------------------------------------------
   * module 11 — sliders and carousels   [data-a11y-slider]
   *
   * Also upgrades Webflow's native .w-slider. Announces the current slide,
   * names the unlabelled arrow and dot controls, and — where a slider
   * autoplays — respects reduced motion by not fighting it (module 13
   * handles the pause).
   * -------------------------------------------------------------------- */

  function sliders() {
    var els = qsa("[data-a11y-slider], .w-slider").filter(function (el) { return !skip(el); });

    els.forEach(function (slider) {
      if (slider.__rsnlSlider) { return; }
      slider.__rsnlSlider = true;

      softSet(slider, "role", "region");
      softSet(slider, "roledescription", "carousel");
      if (!hasName(slider)) {
        var label = slider.getAttribute("data-a11y-slider");
        slider.setAttribute("aria-label", (label && label !== "true") ? label : "Carousel");
      }

      var mask = slider.querySelector(".w-slider-mask, [data-a11y-slider-track]");
      if (mask) {
        softSet(mask, "aria-live", prefersReducedMotion() ? "polite" : "off");
      }

      var left = slider.querySelector(".w-slider-arrow-left, [data-a11y-slider-prev]");
      var right = slider.querySelector(".w-slider-arrow-right, [data-a11y-slider-next]");
      if (left && !hasName(left)) { left.setAttribute("aria-label", "Previous slide"); }
      if (right && !hasName(right)) { right.setAttribute("aria-label", "Next slide"); }

      var dots = qsa(".w-slider-dot, [data-a11y-slider-dot]", slider);
      dots.forEach(function (dot, i) {
        if (!hasName(dot)) { dot.setAttribute("aria-label", "Go to slide " + (i + 1)); }
        softSet(dot, "role", "button");
        if (!dot.hasAttribute("tabindex")) { dot.setAttribute("tabindex", "0"); }
      });

      var slides = qsa(".w-slide, [data-a11y-slide]", slider);
      slides.forEach(function (slide, i) {
        softSet(slide, "role", "group");
        softSet(slide, "roledescription", "slide");
        if (!hasName(slide)) {
          slide.setAttribute("aria-label", (i + 1) + " of " + slides.length);
        }
      });
    });

    return els.length;
  }

  /* ----------------------------------------------------------------------
   * module 12 — nav dropdowns and the mobile menu
   *
   * Verifies aria-expanded actually toggles, gives the trigger a name,
   * closes on Escape and returns focus, and contains focus while an
   * open mobile panel covers the page.
   * -------------------------------------------------------------------- */

  function navMenus() {
    var toggles = qsa(".w-dropdown-toggle, .w-nav-button, [data-a11y-menu-toggle]")
      .filter(function (el) { return !skip(el); });

    toggles.forEach(function (toggle) {
      if (toggle.__rsnlMenu) { return; }
      toggle.__rsnlMenu = true;

      var wrap = toggle.closest(".w-dropdown, .w-nav, [data-a11y-menu]") || toggle.parentElement;
      var panel = wrap && (wrap.querySelector(".w-dropdown-list, .w-nav-overlay, [data-a11y-menu-panel]"));

      var tag = toggle.tagName.toLowerCase();
      if (tag !== "button") {
        softSet(toggle, "role", "button");
        if (!toggle.hasAttribute("tabindex")) { toggle.setAttribute("tabindex", "0"); }
      }
      if (!hasName(toggle)) {
        toggle.setAttribute("aria-label",
          toggle.classList.contains("w-nav-button") ? "Open menu" : "Open submenu");
      }
      softSet(toggle, "aria-expanded", "false");
      softSet(toggle, "aria-haspopup", "true");
      if (panel) { softSet(toggle, "aria-controls", ensureId(panel, "menu")); }

      function isOpen() {
        if (!wrap) { return false; }
        return wrap.classList.contains("w--open") ||
               wrap.classList.contains("w--nav-menu-open") ||
               toggle.classList.contains("w--open") ||
               (panel && panel.offsetParent !== null && getComputedStyle(panel).display !== "none");
      }

      function sync() { toggle.setAttribute("aria-expanded", isOpen() ? "true" : "false"); }

      toggle.addEventListener("click", function () { window.setTimeout(sync, 60); });
      toggle.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle.click(); }
      });

      if (wrap) {
        wrap.addEventListener("keydown", function (e) {
          if (e.key === "Escape" || e.key === "Esc") {
            if (isOpen()) { toggle.click(); toggle.focus(); }
          } else if (e.key === "Tab" && panel && isOpen() &&
                     panel.classList.contains("w-nav-overlay")) {
            trapFocus(wrap, e);   // full-screen mobile panel only
          }
        });
      }

      if (window.MutationObserver && wrap) {
        try {
          new MutationObserver(sync).observe(wrap, {
            attributes: true, attributeFilter: ["class", "style"], subtree: true
          });
        } catch (e) { /* click handler still syncs */ }
      }

      sync();
    });

    return toggles.length;
  }

  /* ----------------------------------------------------------------------
   * module 13 — reduced motion
   *
   * Opt-in at the OS level means "stop moving things", not "stop everything".
   * Pause autoplaying media and autoplaying sliders; leave content alone.
   * -------------------------------------------------------------------- */

  function reducedMotion() {
    if (!prefersReducedMotion()) { return 0; }
    var n = 0;

    qsa("video[autoplay], audio[autoplay]").forEach(function (media) {
      if (skip(media)) { return; }
      try { media.pause(); media.removeAttribute("autoplay"); n += 1; } catch (e) { /* ignore */ }
    });

    // Webflow background video has no visible control; give it one.
    qsa(".w-background-video").forEach(function (box) {
      if (skip(box)) { return; }
      var video = box.querySelector("video");
      if (!video) { return; }
      try { video.pause(); } catch (e) { /* ignore */ }
      n += 1;
    });

    // Stop sliders that drive themselves.
    qsa(".w-slider[data-autoplay=true], [data-a11y-slider][data-autoplay=true]")
      .forEach(function (slider) {
        slider.setAttribute("data-autoplay", "false");
        n += 1;
      });

    root.setAttribute("data-a11y-reduced-motion", "true");
    return n;
  }

  /* ----------------------------------------------------------------------
   * module 14 — third-party feed images
   *
   * Widgets that inject images with no alt — Instagram feeds being the
   * common one — cannot be fixed in the Designer. Stamp alt after render.
   *
   * These images carry no meaning the page depends on and the widget gives
   * us no caption, so empty alt (decorative) is the honest marking. It is
   * better than a filename being read aloud 25 times, and it is not a
   * substitute for real descriptions on content images.
   * -------------------------------------------------------------------- */

  function feedImages() {
    var SELECTORS = [
      ".si-instagramfeed img", ".instagram-feed img", ".eapps-instagram-feed img",
      "[data-a11y-feed] img"
    ].join(",");
    var stamped = 0;

    function stamp() {
      qsa(SELECTORS).forEach(function (img) {
        if (skip(img) || img.hasAttribute("alt")) { return; }
        var described = img.getAttribute("data-caption") || img.getAttribute("data-alt");
        img.setAttribute("alt", described ? described : "");
        if (!described) { img.setAttribute("role", "presentation"); }
        stamped += 1;
      });
    }

    stamp();

    // Feeds render asynchronously; watch for a while, then stop.
    if (window.MutationObserver) {
      try {
        var observer = new MutationObserver(stamp);
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(function () { observer.disconnect(); }, 10000);
      } catch (e) { /* one pass only */ }
    }

    return stamped;
  }

  /* ----------------------------------------------------------------------
   * module 15 — data tables          [data-a11y-table]
   *
   * Webflow has no native <table>. A grid of divs is invisible as a table,
   * so row and column relationships are lost. Apply ARIA table roles.
   * -------------------------------------------------------------------- */

  function tables() {
    var els = qsa("[data-a11y-table]").filter(function (el) { return !skip(el); });

    els.forEach(function (table) {
      if (table.tagName.toLowerCase() === "table") { return; }   // already real

      softSet(table, "role", "table");
      var label = table.getAttribute("data-a11y-table");
      if (label && label !== "true" && !hasName(table)) {
        table.setAttribute("aria-label", label);
      }

      qsa("[data-a11y-row]", table).forEach(function (row, i) {
        softSet(row, "role", "row");
        softSet(row, "aria-rowindex", String(i + 1));
        qsa("[data-a11y-cell], [data-a11y-colheader]", row).forEach(function (cell, j) {
          var isHeader = cell.hasAttribute("data-a11y-colheader");
          softSet(cell, "role", isHeader ? "columnheader" : "cell");
          softSet(cell, "aria-colindex", String(j + 1));
        });
      });
    });

    return els.length;
  }

  /* ----------------------------------------------------------------------
   * run
   * -------------------------------------------------------------------- */

  var MODULES = [
    { name: "skipLink",      fn: skipLink },
    { name: "landmarks",     fn: landmarks },
    { name: "divButton",     fn: divButton },
    { name: "accordion",     fn: accordion },
    { name: "dialog",        fn: dialog },
    { name: "formLabels",    fn: formLabels },
    { name: "formErrors",    fn: formErrors },
    { name: "formStatus",    fn: formStatus },
    { name: "results",       fn: results },
    { name: "maps",          fn: maps },
    { name: "sliders",       fn: sliders },
    { name: "navMenus",      fn: navMenus },
    { name: "reducedMotion", fn: reducedMotion },
    { name: "feedImages",    fn: feedImages },
    { name: "tables",        fn: tables }
  ];

  function run() {
    var report = [];
    MODULES.forEach(function (module) {
      var count = 0;
      try {
        count = module.fn() || 0;
      } catch (error) {
        // One broken module must never take down the other fourteen.
        count = -1;
        if (window.console && console.warn) {
          console.warn("[" + NS + "] " + module.name + " failed:", error);
        }
      }
      report.push({ module: module.name, elements: count });
    });

    window.__rsnlA11y = {
      version: VERSION,
      modules: report,
      announce: announce,
      rerun: run          // call after injecting markup, e.g. a CMS load-more
    };

    if (window.console && console.log) {
      console.log("[" + NS + "] v" + VERSION + " ready", report);
    }
    return report;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

})(window, document);
