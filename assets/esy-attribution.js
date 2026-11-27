/* Ecom Syndicate attribution helper (quiz + shortform).
   - Reads utm_* / fbclid from the URL on every page load.
   - First touch: saved once in localStorage "esy_first_touch" and never replaced.
   - Last touch: localStorage "esy_last_touch", replaced whenever the URL carries campaign params.
   - Sets the Meta _fbc cookie from fbclid (fb.1.<ms>.<fbclid>) if the pixel hasn't already.
   - payload(): attribution fields sent to lead-intake (incl. a shared event_id for pixel/CAPI dedup).
   - calendlyQuery(): utm_* params for the Calendly embed so bookings keep the ad source.
   No personal data is stored here. */
(function () {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid"];
  var DAY = 864e5;
  function ls(k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function cookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setCookie(name, val, days) {
    try { document.cookie = name + "=" + encodeURIComponent(val) + "; max-age=" + Math.round(days * 86400) + "; path=/; SameSite=Lax; Secure"; } catch (e) {}
  }
  function uuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  var qs = new URLSearchParams(location.search), touch = {}, has = false;
  KEYS.forEach(function (k) { var v = (qs.get(k) || "").slice(0, 255); if (v) { touch[k] = v; has = true; } });
  var now = new Date().toISOString();
  var pageUrl = location.origin + location.pathname;
  if (has) {
    touch.at = now;
    touch.landing_url = (location.origin + location.pathname + location.search).slice(0, 1000);
    touch.referrer = (document.referrer || "").slice(0, 500);
    if (!ls("esy_first_touch")) ls("esy_first_touch", touch);
    ls("esy_last_touch", touch);
    try { sessionStorage.setItem("esy_session_touch", JSON.stringify(touch)); } catch (e) {}
  } else if (!ls("esy_first_touch")) {
    // Direct/organic visit with no params: remember it as first touch too (marks "no ad source").
    ls("esy_first_touch", { at: now, landing_url: pageUrl, referrer: (document.referrer || "").slice(0, 500), direct: true });
  }
  // _fbc: Meta's click-id cookie. Create/refresh it only when this visit carries a new fbclid.
  if (touch.fbclid) {
    var cur = cookie("_fbc");
    if (!cur || cur.split(".").slice(3).join(".") !== touch.fbclid) setCookie("_fbc", "fb.1." + Date.now() + "." + touch.fbclid, 90);
  }
  function session() { try { return JSON.parse(sessionStorage.getItem("esy_session_touch") || "null"); } catch (e) { return null; } }
  window.ESYAttr = {
    newEventId: function () { return "lead." + uuid(); },
    current: function () { return session() || ls("esy_last_touch") || {}; },
    payload: function (eventId) {
      var cur = this.current(), out = {
        event_id: eventId,
        fbc: cookie("_fbc") || "",
        fbp: cookie("_fbp") || "",
        fbclid: cur.fbclid || "",
        utm_id: cur.utm_id || "",
        page_url: pageUrl,
        landing_url: cur.landing_url || location.href.slice(0, 1000),
        referrer: cur.referrer || (document.referrer || "").slice(0, 500),
        submitted_at: new Date().toISOString(),
        first_touch: ls("esy_first_touch") || null,
        last_touch: ls("esy_last_touch") || null
      };
      // QA only: ?esy_test_event_code=TEST123 forwards a Meta test code. The server honours it
      // only for @example.com test leads; real leads are never affected.
      var tc = (qs.get("esy_test_event_code") || "").slice(0, 40);
      if (/^TEST[A-Za-z0-9]+$/.test(tc)) out.test_event_code = tc;
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { out[k] = cur[k] || ""; });
      return out;
    },
    calendlyQuery: function () {
      var cur = this.current(), p = [];
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { if (cur[k]) p.push(k + "=" + encodeURIComponent(cur[k])); });
      return p.length ? "&" + p.join("&") : "";
    }
  };
})();
