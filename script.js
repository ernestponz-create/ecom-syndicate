/* ===== CONFIG (edit these) ===================================== */
const FORM_ENDPOINT = "https://jgujrubjdittbgjwzhwn.supabase.co/functions/v1/lead-intake"; // primary: CRM lead intake (Supabase edge function)
const BACKUP_ENDPOINT = "https://formsubmit.co/ajax/ernestponz@gmail.com"; // backup: FormSubmit emails each lead (fire-and-forget; first submission needs a one-time activation click)
const BOOKING_URL   = 'https://calendly.com/ernestponz/30min';                                    
const CONTACT_EMAIL = 'ernestponz@gmail.com'; // shown in the privacy policy
/* =============================================================== */

(function () {
  var yr = document.getElementById("yr"); if (yr) yr.textContent = new Date().getFullYear();
  document.querySelectorAll("[data-contact-email]").forEach(function (el) {
    if (CONTACT_EMAIL) { el.innerHTML = '<a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + "</a>"; }
    else { el.textContent = "[add contact email]"; }
  });

  var sticky = document.getElementById("sticky");
  if (sticky) {
    var book = document.getElementById("book");
    var upd = function () {
      var past = window.scrollY > 500;
      var r = book.getBoundingClientRect();
      var inBook = r.top < window.innerHeight * 0.6 && r.bottom > 0;
      sticky.classList.toggle("show", past && !inBook);
    };
    addEventListener("scroll", upd, { passive: true }); upd();
  }

  var form = document.getElementById("lead-form");
  if (!form) return;
  var err = document.getElementById("form-error"), btn = document.getElementById("submit-btn");

  function showThanks() {
    var b = document.getElementById("booking");
    if (BOOKING_URL) {
      var f = document.createElement("iframe"); f.src = BOOKING_URL; f.title = "Book your free call"; f.loading = "lazy";
      b.innerHTML = ""; b.appendChild(f); b.style.padding = "0"; b.style.border = "0";
    } else {
      b.innerHTML = "<div><strong style='color:#f0d06e'>Booking calendar goes here</strong><br>Set <code>BOOKING_URL</code> at the top of script.js (Cal.com or Calendly link) and your calendar will appear in this spot.</div>";
    }
    document.getElementById("formbox").classList.add("sent");
    var t = document.getElementById("thanks"); t.focus({ preventScroll: true });
    document.getElementById("formbox").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault(); err.textContent = "";
    var d = new FormData(form);
    if (d.get("website")) { showThanks(); return; } // honeypot: bots get a fake success
    var missing = ["name", "phone", "email", "situation", "readiness", "timeline"].filter(function (k) { return !String(d.get(k) || "").trim(); });
    if (missing.length || !form.elements.consent.checked) { err.textContent = "Please complete all fields and accept the consent box."; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.get("email"))) { err.textContent = "Please enter a valid email address."; return; }
    if (String(d.get("phone")).replace(/\D/g, "").length < 10) { err.textContent = "Please enter a valid phone number."; return; }

    d.delete("website");
    var payload = Object.fromEntries(d); delete payload.consent;
    payload.consent = "Agreed to be contacted";
    payload.source_page = location.href;
    payload.website = "";
    var backup = Object.assign({}, payload, {
      consent: "Agreed to be contacted", _subject: "New lead - The Ecom Syndicate",
      _template: "table", _captcha: "false", _replyto: payload.email
    });
    delete backup.website;

    function post(url, body) {
      return fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Accept: "application/json" } })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok || j.success === "false" || j.success === false) throw new Error(j.message || r.status);
            return j;
          });
        });
    }

    btn.disabled = true; btn.textContent = "Sending…";
    var primary = post(FORM_ENDPOINT, payload).then(function () { return true; }, function (e) { console.warn("lead-intake failed", e); return false; });
    var secondary = post(BACKUP_ENDPOINT, backup).then(function () { return true; }, function (e) { console.warn("backup email failed", e); return false; });
    // Primary (CRM) decides success; if it fails, wait for the backup so a saved-by-email lead still counts.
    primary.then(function (ok) {
      if (ok) return true;
      return secondary;
    }).then(function (ok) {
      if (ok) showThanks(); else err.textContent = "Something went wrong. Please try again.";
    }).then(function () {
      btn.disabled = false; btn.textContent = "Book a free call";
    });
  });
})();
