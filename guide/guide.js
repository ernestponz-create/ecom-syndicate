(function () {
  var y = document.getElementById("yr");
  if (y) y.textContent = new Date().getFullYear();

  function track(name, props) {
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch (e) {}
  }

  (function registerCampaign() {
    try {
      var qs = new URLSearchParams(location.search);
      var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "ttclid", "msclkid"];
      var sp = { source_page: "guide" };
      keys.forEach(function (k) { var v = qs.get(k); if (v) sp[k] = v; });
      if (window.posthog && posthog.register) posthog.register(sp);
    } catch (e) {}
  })();

  var viewed = false;
  function fireView() {
    if (viewed) return true;
    try {
      if (window.posthog && window.posthog.capture) {
        window.posthog.capture("guide_viewed", { source_page: "guide" });
        viewed = true;
        return true;
      }
    } catch (e) {}
    return false;
  }
  if (!fireView()) {
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      if (fireView() || n > 40) clearInterval(t);
    }, 250);
  }
})();
