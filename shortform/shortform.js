/* ===== CONFIG ===== */
/* Real lead-intake is only used on the live GitHub Pages host. Any other host
   (localhost, file://, a preview) posts to /mock-lead-intake so tests never
   write to the CRM. */
var LIVE_HOSTS = ["ernestponz-create.github.io"];
var LEAD_ENDPOINT = LIVE_HOSTS.indexOf(location.hostname) !== -1
  ? "https://jgujrubjdittbgjwzhwn.supabase.co/functions/v1/lead-intake"
  : "/mock-lead-intake";
var CALENDLY_URL  = "https://calendly.com/ernestponz/30min";
var SOURCE_PAGE   = "shortform"; // lead-intake stores this as lead_source via normLeadSource(); 'shortform' is a valid slug
/* ================== */

(function () {
  var lead = {}, attempts = 0, started = false;

  var $ = function (id) { return document.getElementById(id); };
  $("yr").textContent = new Date().getFullYear();

  function track(name, props) {
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch (e) {}
  }

  var campaign = {};
  (function () {
    try {
      var qs = new URLSearchParams(location.search);
      var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "ttclid", "msclkid"];
      keys.forEach(function (k) { var v = qs.get(k); if (v) campaign[k] = v; });
      var sp = { source_page: SOURCE_PAGE };
      Object.keys(campaign).forEach(function (k) { sp[k] = campaign[k]; });
      if (window.posthog && posthog.register) posthog.register(sp);
    } catch (e) {}
  })();

  function hashEmail(email) {
    try {
      if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(email).trim().toLowerCase())).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  window.addEventListener("message", function (e) {
    try {
      if (!/^https:\/\/([a-z0-9-]+\.)*calendly\.com$/.test(e.origin || "")) return;
      if (e.data && e.data.event === "calendly.event_scheduled") track("calendly_booked", { source_page: SOURCE_PAGE });
    } catch (x) {}
  });

  var form = $("lead-form"), err = $("err"), send = $("send");

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  function getUtms() {
    var out = {}, qs = new URLSearchParams(window.location.search), stored = {};
    try { stored = JSON.parse(sessionStorage.getItem("esy_utms") || "{}"); } catch (e) {}
    UTM_KEYS.forEach(function (k) {
      var v = (qs.get(k) || stored[k] || "").slice(0, 200);
      if (v) out[k] = v;
    });
    try { sessionStorage.setItem("esy_utms", JSON.stringify(out)); } catch (e) {}
    return out;
  }
  var UTMS = getUtms();

  function build(d) {
    return {
      utm_source: UTMS.utm_source || "", utm_medium: UTMS.utm_medium || "",
      utm_campaign: UTMS.utm_campaign || "", utm_content: UTMS.utm_content || "",
      utm_term: UTMS.utm_term || "",
      name: d.name, email: d.email, phone: d.phone,
      situation: "",
      readiness: "",
      timeline: "",
      consent: "Agreed to be contacted",
      source_page: SOURCE_PAGE,
      website: ""
    };
  }

  form.addEventListener("focusin", function (e) {
    var t = e.target;
    if (!started && t && /^(name|email|phone)$/.test(t.name)) {
      started = true;
      track("shortform_started", { field: t.name, source_page: SOURCE_PAGE });
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault(); err.textContent = "";
    Array.prototype.forEach.call(form.querySelectorAll("input"), function (i) { i.classList.remove("bad"); });
    var d = {
      name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim()
    };
    var bad = [];
    if (d.name.length < 2) bad.push("name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) bad.push("email");
    if (d.phone.replace(/\D/g, "").length < 10) bad.push("phone");
    if (bad.length) {
      bad.forEach(function (n) { form[n].classList.add("bad"); });
      track("shortform_error", { reason: "validation", fields: bad });
      form[bad[0]].focus({ preventScroll: true });
      err.textContent = bad[0] === "name" ? "Please enter your full name." : bad[0] === "email" ? "Please enter a valid email." : "Please enter a valid phone number (10 digits).";
      return;
    }
    if (!form.consent.checked) {
      track("shortform_error", { reason: "validation", fields: ["consent"] });
      err.textContent = "Please tick the consent box to continue.";
      return;
    }
    lead = d;
    if (form.website.value) { showFinal(); return; }
    send.disabled = true; send.textContent = "Sending\u2026";
    fetch(LEAD_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(build(d)) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success !== true) throw new Error(j.message || r.status); return j; }); })
      .then(function (j) { try { if (window.fbq) fbq("track", "Lead", { content_name: "shortform_lead" }); } catch (e) {} afterLead(d, j); showFinal(); })
      .catch(function (ex) {
        console.warn("lead-intake failed", ex); attempts++;
        track("shortform_error", { reason: "submit_failed", attempt: attempts });
        if (attempts >= 2) { showFinal(); return; }
        err.textContent = "Something went wrong. Please tap the button to try again.";
        send.disabled = false; send.textContent = "Try again";
      });
  });

  function afterLead(d, j) {
    var id = j && (j.lead_id || j.contact_id || j.id);
    var fire = function () { track("shortform_submitted", { attempt: attempts + 1, source_page: SOURCE_PAGE, id_type: id ? "lead_id" : "hashed_email" }); };
    var ident = function (distinct) {
      try { if (distinct && window.posthog && posthog.identify) posthog.identify(String(distinct)); } catch (e) {}
      fire();
    };
    if (id) ident("lead_" + id); else hashEmail(d.email).then(function (h) { ident(h ? "sha256_" + h : null); });
  }

  function showFinal() {
    $("ft").innerHTML = "Thanks, <span class='gold'>" + esc(first(lead.name)) + "</span>";
    $("fs").textContent = "Choose a time for your free strategy call with our team.";
    $("fe").textContent = "Free strategy call";
    $("sc").classList.remove("on");
    $("s5").classList.add("on");
    $("app").classList.add("wide");
    var url = CALENDLY_URL + "?hide_gdpr_banner=1&name=" + encodeURIComponent(lead.name || "") + "&email=" + encodeURIComponent(lead.email || "");
    var cal = $("cal"); cal.innerHTML = "";
    var div = document.createElement("div"); div.className = "calendly-inline-widget"; div.setAttribute("data-url", url);
    div.style.cssText = "min-width:300px;height:100%;"; cal.appendChild(div);
    if (window.Calendly && Calendly.initInlineWidget) { Calendly.initInlineWidget({ url: url, parentElement: div }); }
    else {
      var s = document.createElement("script"); s.src = "https://assets.calendly.com/assets/external/widget.js"; s.async = true;
      s.onload = function () { if (window.Calendly) Calendly.initInlineWidget({ url: url, parentElement: div }); };
      document.body.appendChild(s);
    }
  }

  function first(n) { return (n || "").split(/\s+/)[0] || "there"; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  track("shortform_viewed", { source_page: SOURCE_PAGE });
})();
