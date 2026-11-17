/* ===== CONFIG (edit this) ===================================== */
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
})();
