/* NovaTechAI — site behaviour.
   No dependencies, no inline script, no third-party requests.
   Everything here degrades gracefully: with JavaScript disabled the site
   remains fully readable and navigable. */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobileQuery = window.matchMedia("(max-width: 900px)");

  /* ----------------------------------------------------------------------
     Current year in the footer
     ---------------------------------------------------------------------- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ----------------------------------------------------------------------
     Header: solid background once the page is scrolled away from the top
     ---------------------------------------------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var syncHeader = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }

  /* ----------------------------------------------------------------------
     Mobile navigation
     ---------------------------------------------------------------------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");

  if (toggle && nav && header) {
    var focusablesIn = function (el) {
      return Array.prototype.filter.call(
        el.querySelectorAll("a[href], button:not([disabled])"),
        function (node) {
          return node.offsetParent !== null;
        }
      );
    };

    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
      header.classList.toggle("is-open", open);
      document.body.classList.toggle("is-locked", open);
    };

    var close = function (returnFocus) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      setOpen(false);
      if (returnFocus) toggle.focus();
    };

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!open);
      if (!open) {
        var first = focusablesIn(nav)[0];
        if (first) first.focus();
      }
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) close(false);
    });

    document.addEventListener("keydown", function (event) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;

      if (event.key === "Escape") {
        close(true);
        return;
      }

      if (event.key !== "Tab") return;

      // Keep focus inside the open panel (the toggle stays part of the loop).
      var items = [toggle].concat(focusablesIn(nav));
      if (items.length < 2) return;

      var first = items[0];
      var last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    // Reset state if the viewport grows past the mobile breakpoint.
    var onBreakpointChange = function (event) {
      if (!event.matches) close(false);
    };
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", onBreakpointChange);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(onBreakpointChange);
    }
  }

  /* ----------------------------------------------------------------------
     Scroll reveal — opt-in, and only when motion is welcome
     ---------------------------------------------------------------------- */
  var revealTargets = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));

  if (revealTargets.length) {
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      revealTargets.forEach(function (el) {
        el.classList.add("is-visible");
      });
    } else {
      revealTargets.forEach(function (el) {
        el.classList.add("reveal");
      });

      // Anything already scrolled past on load (a restored scroll position, a
      // deep link) is shown straight away — it must never sit invisible above
      // the viewport waiting for an intersection that will not happen.
      // Every read happens before every write, so this costs one reflow
      // rather than one per element.
      var alreadyPassed = revealTargets.filter(function (el) {
        return el.getBoundingClientRect().bottom < 0;
      });
      alreadyPassed.forEach(function (el) {
        el.classList.add("is-visible");
      });

      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );

      revealTargets.forEach(function (el) {
        revealObserver.observe(el);
      });
    }
  }

  /* ----------------------------------------------------------------------
     Article: reading progress + table-of-contents highlighting
     ---------------------------------------------------------------------- */
  var progressBar = document.querySelector(".reading-progress__bar");
  var article = document.querySelector("[data-article]");

  if (progressBar && article) {
    var updateProgress = function () {
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var ratio = total > 0 ? (-rect.top) / total : 0;
      progressBar.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
  }

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll("[data-toc] a"));

  if (tocLinks.length && "IntersectionObserver" in window) {
    var sections = tocLinks
      .map(function (link) {
        var id = link.getAttribute("href");
        return id && id.charAt(0) === "#" ? document.querySelector(id) : null;
      })
      .filter(Boolean);

    var visible = new Set();

    var setCurrent = function () {
      var best = null;
      sections.forEach(function (section) {
        if (!visible.has(section)) return;
        if (!best || section.offsetTop < best.offsetTop) best = section;
      });
      tocLinks.forEach(function (link) {
        var isCurrent = Boolean(best) && link.getAttribute("href") === "#" + best.id;
        link.classList.toggle("is-current", isCurrent);
      });
    };

    var tocObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            visible.add(entry.target);
          } else {
            visible.delete(entry.target);
          }
        });
        setCurrent();
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      tocObserver.observe(section);
    });
  }

  /* ----------------------------------------------------------------------
     Email chooser

     A bare mailto: link does nothing at all for a visitor with no mail client
     configured — common on Windows, and on any machine where the person lives
     in webmail. So every mailto: link keeps its real href (it still works with
     JavaScript disabled, and right-click "Copy email address" still works) and
     is enhanced on click with a small menu: their own mail app, Gmail, either
     flavour of Outlook, or copy the address.

     No third-party requests are made. These are ordinary links the visitor
     chooses to follow, so the strict Content-Security-Policy is unaffected.
     ---------------------------------------------------------------------- */
  var mailLinks = Array.prototype.slice.call(document.querySelectorAll('a[href^="mailto:"]'));

  if (mailLinks.length) {
    var menuEl = null;
    var menuTrigger = null;

    var parseMailto = function (href) {
      var rest = href.slice(7);
      var q = rest.indexOf("?");
      var params = new URLSearchParams(q === -1 ? "" : rest.slice(q + 1));
      return {
        to: decodeURIComponent(q === -1 ? rest : rest.slice(0, q)),
        subject: params.get("subject") || "",
        body: params.get("body") || ""
      };
    };

    var servicesFor = function (m) {
      var qs = function (obj) {
        return new URLSearchParams(obj).toString();
      };
      return [
        { label: "Your email app", useMailto: true },
        {
          label: "Gmail",
          href: "https://mail.google.com/mail/?" +
            qs({ view: "cm", fs: "1", to: m.to, su: m.subject, body: m.body })
        },
        {
          label: "Outlook — work or school",
          href: "https://outlook.office.com/mail/deeplink/compose?" +
            qs({ to: m.to, subject: m.subject, body: m.body })
        },
        {
          label: "Outlook.com — personal",
          href: "https://outlook.live.com/mail/0/deeplink/compose?" +
            qs({ to: m.to, subject: m.subject, body: m.body })
        },
        { label: "Copy address", copy: true }
      ];
    };

    var positionMenu = function () {
      if (!menuEl || !menuTrigger) return;
      var r = menuTrigger.getBoundingClientRect();
      var w = menuEl.offsetWidth;
      var h = menuEl.offsetHeight;
      var top = r.bottom + 8;
      if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
      menuEl.style.left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12) + "px";
      menuEl.style.top = top + "px";
    };

    var onOutside = function (event) {
      if (!menuEl) return;
      if (menuEl.contains(event.target) || menuTrigger.contains(event.target)) return;
      closeMenu(false);
    };

    var onMenuKey = function (event) {
      if (!menuEl) return;
      var items = Array.prototype.slice.call(menuEl.querySelectorAll('[role="menuitem"]'));
      var i = items.indexOf(document.activeElement);

      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(i + 1 + items.length) % items.length].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
      } else if (event.key === "Tab") {
        if ((event.shiftKey && i <= 0) || (!event.shiftKey && i === items.length - 1)) closeMenu(false);
      }
    };

    function closeMenu(returnFocus) {
      if (!menuEl) return;
      var trigger = menuTrigger;
      menuEl.remove();
      menuEl = null;
      menuTrigger = null;
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
      document.removeEventListener("keydown", onMenuKey, true);
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    }

    var copyAddress = function (address, button, status) {
      var finish = function (ok) {
        status.textContent = ok ? "Address copied to the clipboard" : "Select the address and press Ctrl+C";
        button.textContent = ok ? "Address copied" : "Copy failed";
        if (ok) window.setTimeout(function () { closeMenu(true); }, 1000);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(address).then(
          function () { finish(true); },
          function () { finish(false); }
        );
      } else {
        finish(false);
      }
    };

    var buildMenu = function (trigger) {
      var m = parseMailto(trigger.getAttribute("href"));
      var menu = document.createElement("div");
      menu.className = "mail-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Choose how to email " + m.to);

      var head = document.createElement("p");
      head.className = "mail-menu__head";
      head.textContent = m.to;
      menu.appendChild(head);

      var status = document.createElement("p");
      status.className = "visually-hidden";
      status.setAttribute("role", "status");

      servicesFor(m).forEach(function (svc) {
        var el;
        if (svc.copy) {
          el = document.createElement("button");
          el.type = "button";
          el.addEventListener("click", function () { copyAddress(m.to, el, status); });
        } else {
          el = document.createElement("a");
          el.href = svc.useMailto ? trigger.getAttribute("href") : svc.href;
          if (!svc.useMailto) {
            el.target = "_blank";
            el.rel = "noopener noreferrer";
          }
          el.addEventListener("click", function () { closeMenu(false); });
        }
        el.className = "mail-menu__item";
        el.setAttribute("role", "menuitem");
        el.textContent = svc.label;
        menu.appendChild(el);
      });

      menu.appendChild(status);
      return menu;
    };

    mailLinks.forEach(function (link) {
      link.setAttribute("aria-haspopup", "menu");
      link.setAttribute("aria-expanded", "false");

      link.addEventListener("click", function (event) {
        // Leave modifier and middle clicks alone so people can bypass the menu.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();

        if (menuTrigger === link) {
          closeMenu(true);
          return;
        }
        closeMenu(false);

        menuTrigger = link;
        menuEl = buildMenu(link);
        document.body.appendChild(menuEl);
        link.setAttribute("aria-expanded", "true");
        positionMenu();
        menuEl.querySelector('[role="menuitem"]').focus();

        document.addEventListener("keydown", onMenuKey, true);
        document.addEventListener("pointerdown", onOutside, true);
        window.addEventListener("resize", positionMenu);
        window.addEventListener("scroll", positionMenu, true);
      });
    });
  }
})();
