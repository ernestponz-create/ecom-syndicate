/* ===== CONFIG ===== */
const LEAD_ENDPOINT = "https://jgujrubjdittbgjwzhwn.supabase.co/functions/v1/lead-intake";
const CALENDLY_URL  = "https://calendly.com/ernestponz/30min";
const SOURCE_PAGE   = "quiz";
/* ================== */

(function () {
  var QUESTIONS = [
    { key: "situation", text: "Where are you right now?", opts: [
      "I don't have a store yet",
      "I have a store, but it's not profitable yet",
      "I have a profitable store",
      "I run a different business" ] },
    { key: "goal", text: "What's your main goal?", opts: [
      "Launch my first ecommerce store",
      "Fix and grow my current store",
      "Scale what's already working",
      "Add ecommerce to my business" ] },
    { key: "timeline", text: "When do you want to get started?", opts: [
      "As soon as possible",
      "In 1\u20133 months",
      "Just researching" ] },
    { key: "readiness", text: "Ready to work with a done-for-you team and fund your own ad spend?", opts: [
      "Yes, I'm ready",
      "Yes, I'd like details first",
      "Not yet" ] }
  ];
  var answers = {}, lead = {}, qi = -1, view = "q", attempts = 0;

  var $ = function (id) { return document.getElementById(id); };
  var steps = { q: $("sq"), contact: $("sc"), final: $("s5") };
  var bar = $("bar"), fill = $("barfill"), back = $("back"), app = $("app");
  $("yr").textContent = new Date().getFullYear();

  /* ---- analytics (PostHog). Every call is a safe no-op if PostHog is not loaded. ---- */
  function track(name, props) {
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch (e) {}
  }
  function stepInfo(name) {
    if (name === "intro") return { step: 0, question: "intro" };
    if (name === "q") return { step: qi + 1, question: QUESTIONS[qi].text, question_key: QUESTIONS[qi].key };
    if (name === "contact") return { step: QUESTIONS.length + 1, question: "contact form" };
    return { step: QUESTIONS.length + 2, question: "calendly booking" };
  }
  var seen = {}, stepStart = Date.now(), curStep = null, scrollHit = {};
  var campaign = {};
  (function () { // UTM + click ids as super properties (attached to every event)
    try {
      var qs = new URLSearchParams(location.search), keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "ttclid", "msclkid"];
      keys.forEach(function (k) { var v = qs.get(k); if (v) campaign[k] = v; });
      var sp = { source_page: SOURCE_PAGE };
      Object.keys(campaign).forEach(function (k) { sp[k] = campaign[k]; });
      if (window.posthog && posthog.register) posthog.register(sp);
    } catch (e) {}
  })();
  function sendStepTime(reason) { // time spent on the step being left / abandoned
    if (!curStep) return;
    var secs = Math.round((Date.now() - stepStart) / 100) / 10;
    if (secs > 0) track("quiz_step_time", { step: curStep.step, question: curStep.question, seconds: secs, reason: reason });
    stepStart = Date.now();
  }
  function scrollPct() {
    var d = document.documentElement, max = d.scrollHeight - d.clientHeight;
    return max <= 0 ? 100 : Math.round((window.pageYOffset || d.scrollTop) / max * 100);
  }
  var scrollTimer = null;
  window.addEventListener("scroll", function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      var p = scrollPct(), k = curStep ? curStep.step : -1;
      [25, 50, 75, 100].forEach(function (t) {
        var key = k + ":" + t;
        if (p >= t && !scrollHit[key] && document.documentElement.scrollHeight > document.documentElement.clientHeight) {
          scrollHit[key] = 1; track("quiz_scroll_depth", { depth_percent: t, step: k, question: curStep && curStep.question });
        }
      });
    }, 150);
  }, { passive: true });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") sendStepTime("page_hidden"); else stepStart = Date.now(); });
  window.addEventListener("pagehide", function () { sendStepTime("page_hide"); });
  function hashEmail(email) { // SHA-256 hex of the lowercased email; the raw email is never sent
    try {
      if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(email).trim().toLowerCase())).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  /* Calendly booking: Calendly posts {event:"calendly.event_scheduled"} from its iframe */
  window.addEventListener("message", function (e) {
    try {
      if (!/^https:\/\/([a-z0-9-]+\.)*calendly\.com$/.test(e.origin || "")) return;
      if (e.data && e.data.event === "calendly.event_scheduled") track("calendly_booked", { step: stepInfo("final").step, readiness: answers.readiness || "" });
    } catch (x) {}
  });

  function show(name) {
    sendStepTime("step_change");
    view = name;
    curStep = stepInfo(name); stepStart = Date.now();
    var sk = curStep.step + ":" + (curStep.question_key || "");
    var vp = { step: curStep.step, question: curStep.question, is_revisit: !!seen[sk] };
    if (curStep.question_key) vp.question_key = curStep.question_key;
    seen[sk] = 1;
    track("quiz_step_viewed", vp);
    Object.keys(steps).forEach(function (k) { steps[k].classList.toggle("on", k === name); });
    var units = QUESTIONS.length + 2; // questions + contact + final
    var done = name === "intro" ? 0 : name === "q" ? qi + 1 : name === "contact" ? QUESTIONS.length + 1 : units;
    fill.style.width = Math.round(done / units * 100) + "%";
    bar.classList.toggle("on", true);
    back.classList.toggle("on", (name === "q" && qi > 0) || name === "contact");
    app.classList.toggle("wide", name === "final");
  }

  function renderQ() {
    var q = QUESTIONS[qi];
    $("qcount").textContent = "Question " + (qi + 1) + " of " + QUESTIONS.length;
    $("qtext").textContent = q.text;
    var box = $("opts"); box.innerHTML = "";
    q.opts.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "opt" + (answers[q.key] === o ? " sel" : ""); b.textContent = o;
      b.addEventListener("click", function () {
        answers[q.key] = o; b.classList.add("sel");
        track("quiz_answer_selected", { step: qi + 1, question: q.text, question_key: q.key, answer: o, answer_index: q.opts.indexOf(o) });
        setTimeout(function () { next(); }, 160);
      });
      box.appendChild(b);
    });
    show("q");
  }
  function next() {
    if (qi < QUESTIONS.length - 1) { qi++; renderQ(); } else { var done = {}; QUESTIONS.forEach(function (qq) { done[qq.key] = answers[qq.key] || null; }); done.total_questions = QUESTIONS.length; track("quiz_completed", done); show("contact"); var f = document.querySelector("#lead-form [name=name]"); if (f && !lead.name) f.focus({ preventScroll: true }); }
  }
  back.addEventListener("click", function () {
    track("quiz_back", { from_view: view, from_step: curStep ? curStep.step : null, from_question: curStep ? curStep.question : null });
    if (view === "contact") { qi = QUESTIONS.length - 1; renderQ(); }
    else if (view === "q") { if (qi > 0) { qi--; renderQ(); } }
  });

  /* ---- contact + submit ---- */
  var form = $("lead-form"), err = $("err"), send = $("send");
  function mapReadiness(r) {
    if (/^yes, i'm ready/i.test(r)) return "Yes, I'm ready to move forward";
    if (/^yes, i'd like details/i.test(r)) return "Yes, I'd like to understand the details first";
    return "Not sure yet / not right now";
  }
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
  var EVENT_ID = null; // one id per lead, shared by the browser pixel and the server (CAPI) for dedup
  function build(d) {
    if (!EVENT_ID) EVENT_ID = window.ESYAttr ? ESYAttr.newEventId() : "lead." + Date.now() + "." + Math.random().toString(36).slice(2);
    var attr = {};
    try { if (window.ESYAttr) attr = ESYAttr.payload(EVENT_ID); else attr = { event_id: EVENT_ID }; } catch (e) { attr = { event_id: EVENT_ID }; }
    var body = {
      utm_source: UTMS.utm_source || "", utm_medium: UTMS.utm_medium || "",
      utm_campaign: UTMS.utm_campaign || "", utm_content: UTMS.utm_content || "",
      utm_term: UTMS.utm_term || "",
      name: d.name, email: d.email, phone: d.phone,
      situation: (answers.situation || "") + " \u2014 goal: " + (answers.goal || ""),
      readiness: mapReadiness(answers.readiness || ""),
      timeline: answers.timeline || "",
      consent: "Agreed to be contacted",
      source_page: SOURCE_PAGE,
      website: ""
    };
    Object.keys(attr).forEach(function (k) { if (attr[k] !== undefined && attr[k] !== "" && attr[k] !== null) body[k] = attr[k]; });
    // UTMs = this visit's touch as one set (never mix keys from two different clicks).
    if (window.ESYAttr && attr.page_url) UTM_KEYS.forEach(function (k) { body[k] = attr[k] || ""; });
    return body;
  }
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
      track("lead_form_validation_error", { fields: bad }); // field names only, never values
      form[bad[0]].focus({ preventScroll: true });
      err.textContent = bad[0] === "name" ? "Please enter your full name." : bad[0] === "email" ? "Please enter a valid email." : "Please enter a valid phone number (10 digits).";
      return;
    }
    if (!form.consent.checked) { track("lead_form_validation_error", { fields: ["consent"] }); err.textContent = "Please tick the consent box to continue."; return; }
    lead = d;
    if (form.website.value) { showFinal(); return; } // honeypot: bots get a fake success, nothing is sent
    send.disabled = true; send.textContent = "Sending\u2026";
    fetch(LEAD_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(build(d)) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success !== true) throw new Error(j.message || r.status); return j; }); })
      .then(function (j) { try { if (window.fbq) fbq('track', 'Lead', { content_name: 'quiz_lead' }, { eventID: EVENT_ID }); } catch (e) {} afterLead(d, j); showFinal(); })
      .catch(function (ex) {
        console.warn("lead-intake failed", ex); attempts++;
        track("lead_form_failed", { attempt: attempts });
        if (attempts >= 2) { showFinal(); return; } // don't strand the visitor: let them book anyway
        err.textContent = "Something went wrong. Please tap the button to try again.";
        send.disabled = false; send.textContent = "Try again";
      });
  });

  /* identify with lead id (if the API returns one) or hashed email, then record the submit (no personal data in props) */
  function afterLead(d, j) {
    var id = j && (j.lead_id || j.contact_id || j.id);
    var fire = function () { track("lead_form_submitted", { attempt: attempts + 1, source_page: SOURCE_PAGE, id_type: id ? "lead_id" : "hashed_email" }); };
    var ident = function (distinct) {
      try { if (distinct && window.posthog && posthog.identify) posthog.identify(String(distinct)); } catch (e) {}
      fire();
    };
    if (id) ident("lead_" + id); else hashEmail(d.email).then(function (h) { ident(h ? "sha256_" + h : null); });
  }

  /* ---- final: Calendly ---- */
  function showFinal() {
    var notYet = !/^yes/i.test(answers.readiness || "");
    $("ft").innerHTML = notYet ? "Thanks, <span class='gold'>" + esc(first(lead.name)) + "</span>" : "You qualify \u2014 <span class='gold'>pick a time</span>";
    $("fs").textContent = notYet
      ? "No pressure. If you'd like to learn how it works, grab a time for a free call whenever you're ready."
      : "Choose a time for your free strategy call with our team.";
    $("fe").textContent = notYet ? "Free call" : "You're in";
    show("final");
    var url = CALENDLY_URL + "?hide_gdpr_banner=1&name=" + encodeURIComponent(lead.name || "") + "&email=" + encodeURIComponent(lead.email || "") + (window.ESYAttr ? ESYAttr.calendlyQuery() : "");
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
  /* Opens on question 1 (intro screen removed 2026-11-25).
     quiz_started now fires when Q1 is shown, not when a Start button is tapped.
     Step numbers stay: Q1–Q4 = 1–4, contact = 5, Calendly = 6. */
  qi = 0;
  track("quiz_started", { step: 1, question: QUESTIONS[0].text, question_key: QUESTIONS[0].key });
  renderQ();

  function first(n) { return (n || "").split(/\s+/)[0] || "there"; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
})();
