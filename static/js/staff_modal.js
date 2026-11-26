/*
 * Staff modal dialog.
 *
 * Links with a `data-staff-modal="<url>"` attribute open that page in a dialog
 * instead of navigating. The server recognises the request by its
 * `X-Requested-With: XMLHttpRequest` header and returns only the page body
 * (see apps/core/http.py). Forms inside the dialog are submitted with fetch so
 * a save keeps you in the dialog; closing it after a change refreshes the list
 * behind it so the table never shows stale data.
 *
 * Used by Sales, Accounting and Users. Orders deliberately keeps full pages.
 */
(function () {
  "use strict";

  var modal = document.getElementById("staff-modal");
  if (!modal) return;

  var panel = modal.querySelector("[data-smx-panel]");
  var body = modal.querySelector("[data-smx-body]");
  var kicker = modal.querySelector("[data-smx-kicker]");

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var state = {
    url: null,        // page currently shown in the dialog
    fallback: null,   // full-page URL, offered if loading fails
    trigger: null,    // element to hand focus back to on close
    dirty: false,     // something was saved; refresh the list behind us on close
    token: 0          // guards against out-of-order responses
  };

  function isOpen() {
    return !modal.hidden;
  }

  function escapeHtml(text) {
    var d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function showLoading() {
    body.innerHTML =
      '<p class="smx__state"><span class="smx__spin" aria-hidden="true"></span>Loading…</p>';
  }

  function showError(message) {
    body.innerHTML = '<p class="smx__state">' + escapeHtml(message) + "</p>";
  }

  /* Inline error above the content; used when a save fails so the form (and
     what the person typed) stays on screen. */
  function flashError(message) {
    var old = body.querySelector("[data-smx-flash]");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "smx-msgs";
    box.setAttribute("data-smx-flash", "");
    box.setAttribute("role", "alert");
    box.innerHTML = '<p class="smx-msg smx-msg--error">' + escapeHtml(message) + "</p>";
    body.insertBefore(box, body.firstChild);
    body.scrollTop = 0;
  }

  /* The edit-user form shows "Can edit accounting" only for the Staff role. */
  function syncRoleToggle() {
    var role = document.getElementById("id_role");
    var wrap = document.getElementById("accounting-toggle-wrap");
    if (role && wrap) wrap.hidden = role.value !== "staff";
  }

  function afterRender() {
    body.scrollTop = 0;
    syncRoleToggle();
    // A pop-up form inside the dialog (e.g. manual payment) reopens itself after a validation error.
    var auto = body.querySelector("dialog[data-open-on-render]");
    if (auto && typeof auto.showModal === "function") {
      auto.showModal();
    } else {
      panel.focus({ preventScroll: true });
    }
  }

  /* Safety net: if the server ever answers with a whole page (top bar, sidebar,
     <main> padding), keep only the detail content so the dialog never shows
     page chrome or a big empty gap above the details. */
  function extractContent(html) {
    if (!/<html[\s>]|<body[\s>]/i.test(html)) return html;
    var doc = new DOMParser().parseFromString(html, "text/html");
    var node = doc.querySelector(".so-wrap, .ue-wrap");
    if (!node) return html;
    [].forEach.call(node.querySelectorAll(".so-crumbs, .ue-crumb"), function (n) { n.remove(); });
    return node.outerHTML;
  }

  function render(html) {
    body.innerHTML = extractContent(html);
    afterRender();
  }

  function load(url) {
    var token = ++state.token;
    state.url = url;
    return fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    })
      .then(function (res) {
        if (token !== state.token) return;
        // Redirected (e.g. session expired -> login): let the browser take over.
        if (res.redirected) {
          window.location.href = state.fallback || url;
          return;
        }
        if (res.status === 403) {
          showError("You don’t have permission to view this.");
          return;
        }
        if (!res.ok) {
          showError("Couldn’t load this. Please try again.");
          return;
        }
        return res.text().then(function (html) {
          if (token === state.token) render(html);
        });
      })
      .catch(function () {
        if (token === state.token) showError("Couldn’t load this. Check your connection and try again.");
      });
  }

  function open(link) {
    var url = link.getAttribute("data-staff-modal") || link.getAttribute("href");
    if (!url) return;

    state.trigger = link;
    state.fallback = url;
    state.dirty = false;

    var title = link.getAttribute("data-modal-title") || "Details";
    kicker.textContent = title;
    panel.setAttribute("aria-label", title);
    modal.classList.toggle("smx--narrow", link.getAttribute("data-modal-size") === "narrow");

    modal.hidden = false;
    document.documentElement.classList.add("smx-open");
    showLoading();
    panel.focus({ preventScroll: true });
    load(url);
  }

  function close() {
    if (!isOpen()) return;
    state.token++; // drop any in-flight response
    modal.hidden = true;
    document.documentElement.classList.remove("smx-open");
    body.innerHTML = "";

    if (state.dirty) {
      // Something changed: reload so the list behind the dialog is current.
      window.location.reload();
      return;
    }
    if (state.trigger && document.contains(state.trigger)) state.trigger.focus();
    state.trigger = null;
  }

  /* Deep link: a list page opened with ?open=/staff/... shows that item in the dialog.
     Direct visits to a detail URL (bookmark, new tab) are redirected here by the server. */
  function openFromQuery() {
    var params = new URLSearchParams(window.location.search);
    var target = params.get("open");
    if (target === null) return;

    params.delete("open");
    var rest = params.toString();
    window.history.replaceState(
      null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash
    );

    // Same-site staff paths only.
    if (!/^\/staff\/[^\s?#]*$/.test(target) || target.indexOf("//") !== -1) return;

    var link = null;
    [].some.call(document.querySelectorAll("a[data-staff-modal]"), function (a) {
      if (a.getAttribute("data-staff-modal") === target) { link = a; return true; }
      return false;
    });
    if (!link) {
      link = document.createElement("a");
      link.setAttribute("href", target);
      link.setAttribute("data-staff-modal", target);
      link.setAttribute("data-modal-title", "Details");
      if (target.indexOf("/staff/users/") === 0) link.setAttribute("data-modal-size", "narrow");
    }
    open(link);
  }

  /* Open: intercept plain left-clicks on trigger links. Modified clicks
     (new tab / window, etc.) fall through to the normal full page. */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest && e.target.closest("a[data-staff-modal]");
    if (!link) return;
    e.preventDefault();
    open(link);
  });

  /* Close: backdrop, X button, or any [data-smx-close] inside the dialog
     (e.g. the Cancel link in the edit-user form). */
  modal.addEventListener("click", function (e) {
    var closer = e.target.closest("[data-smx-close]");
    if (!closer) return;
    e.preventDefault();
    close();
  });

  document.addEventListener("keydown", function (e) {
    if (!isOpen()) return;
    if (e.key === "Escape") {
      if (body.querySelector("dialog[open]")) return; // let a pop-up form close itself first
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    // Keep keyboard focus inside the dialog.
    var items = [].slice.call(panel.querySelectorAll(FOCUSABLE)).filter(function (el) {
      return el.offsetParent !== null;
    });
    if (!items.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* Forms inside the dialog submit with fetch and stay in the dialog. */
  body.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;
    if ((form.getAttribute("method") || "get").toLowerCase() !== "post") return;
    e.preventDefault();

    // Forms without an explicit action post back to the page shown in the dialog.
    var action = form.getAttribute("action") || state.url;
    var buttons = [].slice.call(form.querySelectorAll('button, input[type="submit"]'));
    buttons.forEach(function (b) { b.disabled = true; });

    var token = ++state.token;
    fetch(action, {
      method: "POST",
      body: new FormData(form),
      credentials: "same-origin",
      redirect: "manual", // the view redirects on success; we re-fetch the dialog instead
      headers: { "X-Requested-With": "XMLHttpRequest" }
    })
      .then(function (res) {
        if (token !== state.token) return;

        if (res.type === "opaqueredirect") {
          state.dirty = true;
          // Forms marked data-close-on-save (Create staff) close and refresh the list.
          if (form.hasAttribute("data-close-on-save")) { close(); return; }
          // Otherwise show the fresh state (with its success message) in place.
          return load(state.url);
        }
        if (res.status === 403) {
          buttons.forEach(function (b) { b.disabled = false; });
          flashError("You don’t have permission to do that.");
          return;
        }
        if (res.ok) {
          // Validation errors: the view re-rendered the form with messages.
          return res.text().then(function (html) {
            if (token === state.token) render(html);
          });
        }
        buttons.forEach(function (b) { b.disabled = false; });
        flashError("Couldn’t save your changes. Please try again.");
      })
      .catch(function () {
        if (token !== state.token) return;
        buttons.forEach(function (b) { b.disabled = false; });
        flashError("Couldn’t save your changes. Check your connection and try again.");
      });
  });

  /* Edit-user form: role select toggles the accounting checkbox. Delegated on
     document so it also serves the standalone full-page edit form. */
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "id_role") syncRoleToggle();
  });
  syncRoleToggle();
  openFromQuery();
})();