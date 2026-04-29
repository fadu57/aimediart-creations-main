(function () {
  // Aligné avec le provider React
  var STORAGE_KEY = "ui_language";

  function applySavedLanguageToSelector() {
    var selector = document.getElementById("languageSelector");
    if (!selector) return;
    // Le sélecteur React (Radix) n'est pas un <select> natif:
    // on ne doit pas le manipuler en DOM vanilla.
    if (selector.tagName !== "SELECT") return;
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      selector.value = saved;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function bindLanguageSelector() {
    var selector = document.getElementById("languageSelector");
    if (!selector) return;
    // Pas de binding natif sur le composant React custom.
    if (selector.tagName !== "SELECT") return;
    selector.addEventListener("change", function (e) {
      var value = e && e.target ? e.target.value : "";
      if (!value) return;
      localStorage.setItem(STORAGE_KEY, value);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindLanguageSelector();
    applySavedLanguageToSelector();
  });
})();

