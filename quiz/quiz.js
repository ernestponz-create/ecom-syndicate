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
  var answers = {}, lead = {}, qi = -1, view = "intro", attempts = 0;

  var $ = function (id) { return document.getElementById(id); };
  var steps = { intro: $("s0"), q: $("sq"), contact: $("sc"), final: $("s5") };
  var bar = $("bar"), fill = $("barfill"), back = $("back"), app = $("app");
  $("yr").textContent = new Date().getFullYear();

  function show(name) {
    view = name;
    Object.keys(steps).forEach(function (k) { steps[k].classList.toggle("on", k === name); });
    var units = QUESTIONS.length + 2; // questions + contact + final
    var done = name === "intro" ? 0 : name === "q" ? qi + 1 : name === "contact" ? QUESTIONS.length + 1 : units;
    fill.style.width = Math.round(done / units * 100) + "%";
    bar.classList.toggle("on", name !== "intro");
    back.classList.toggle("on", name === "q" || name === "contact");
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
        setTimeout(function () { next(); }, 160);
      });
      box.appendChild(b);
    });
    show("q");
  }
  function next() {
    if (qi < QUESTIONS.length - 1) { qi++; renderQ(); } else { show("contact"); var f = document.querySelector("#lead-form [name=name]"); if (f && !lead.name) f.focus({ preventScroll: true }); }
  }
  $("start").addEventListener("click", function () { qi = 0; renderQ(); });
  back.addEventListener("click", function () {
    if (view === "contact") { qi = QUESTIONS.length - 1; renderQ(); }
    else if (view === "q") { if (qi > 0) { qi--; renderQ(); } else { show("intro"); } }
  });

  /* ---- contact + submit ---- */
  var form = $("lead-form"), err = $("err"), send = $("send");
  function mapReadiness(r) {
    if (/^yes, i'm ready/i.test(r)) return "Yes, I'm ready to move forward";
    if (/^yes, i'd like details/i.test(r)) return "Yes, I'd like to understand the details first";
    return "Not sure yet / not right now";
  }
  function build(d) {
    return {
      name: d.name, email: d.email, phone: d.phone,
      situation: (answers.situation || "") + " \u2014 goal: " + (answers.goal || ""),
      readiness: mapReadiness(answers.readiness || ""),
      timeline: answers.timeline || "",
      consent: "Agreed to be contacted",
      source_page: SOURCE_PAGE,
      website: ""
    };
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
      form[bad[0]].focus({ preventScroll: true });
      err.textContent = bad[0] === "name" ? "Please enter your full name." : bad[0] === "email" ? "Please enter a valid email." : "Please enter a valid phone number (10 digits).";
      return;
    }
    if (!form.consent.checked) { err.textContent = "Please tick the consent box to continue."; return; }
    lead = d;
    if (form.website.value) { showFinal(); return; } // honeypot: bots get a fake success, nothing is sent
    send.disabled = true; send.textContent = "Sending\u2026";
    fetch(LEAD_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(build(d)) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success !== true) throw new Error(j.message || r.status); }); })
      .then(function () { /* Meta Pixel: fbq('track','Lead') goes here once the pixel is installed */ showFinal(); })
      .catch(function (ex) {
        console.warn("lead-intake failed", ex); attempts++;
        if (attempts >= 2) { showFinal(); return; } // don't strand the visitor: let them book anyway
        err.textContent = "Something went wrong. Please tap the button to try again.";
        send.disabled = false; send.textContent = "Try again";
      });
  });

  /* ---- final: Calendly ---- */
  function showFinal() {
    var notYet = !/^yes/i.test(answers.readiness || "");
    $("ft").innerHTML = notYet ? "Thanks, <span class='gold'>" + esc(first(lead.name)) + "</span>" : "You qualify \u2014 <span class='gold'>pick a time</span>";
    $("fs").textContent = notYet
      ? "No pressure. If you'd like to learn how it works, grab a time for a free call whenever you're ready."
      : "Choose a time for your free strategy call with our team.";
    $("fe").textContent = notYet ? "Free call" : "You're in";
    show("final");
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
})();
