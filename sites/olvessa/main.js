/* Olvessa Cloud, a fictional demo company for FlowHub (PRD 7.30). No tracking, no cookies. */
(function () {
  "use strict";
  var config = window.OLVESSA_CONFIG || {};

  /* The hero's example tabs: migrate, report, automate. Arrow keys move between them. */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".c-tab"));
  function select(tab) {
    tabs.forEach(function (other) {
      var on = other === tab;
      other.setAttribute("aria-selected", String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { select(tab); });
    tab.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var index = tabs.indexOf(tab);
      var next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      select(next);
    });
  });

  /* The Google Form, embedded only from docs.google.com/forms (the page's CSP allows nothing else in a frame). */
  var slot = document.getElementById("form-slot");
  var url = String(config.formEmbedUrl || "");
  var valid = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform\?embedded=true$/.test(url);
  if (slot && valid) {
    var frame = document.createElement("iframe");
    frame.src = url;
    frame.title = "Talk to Olvessa, a Google Form";
    frame.loading = "lazy";
    frame.className = "form-frame";
    frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    frame.textContent = "Loading the form…";
    slot.replaceChildren(frame);
    var open = document.getElementById("form-open");
    if (open) {
      open.href = url.replace("?embedded=true", "");
      open.hidden = false;
    }
  }

  var flowhub = document.getElementById("flowhub-link");
  if (flowhub && /^https:\/\//.test(config.flowhubUrl || "")) flowhub.href = config.flowhubUrl;

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
