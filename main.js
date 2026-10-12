(function () {
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  var list = document.querySelector("[data-articles]");
  if (!list || !window.ARTICLES) return;

  var limit = parseInt(list.getAttribute("data-limit") || "0", 10);
  var items = window.ARTICLES.slice().sort(function (a, b) {
    return (b.date || "").localeCompare(a.date || "");
  });
  var current = "All";

  function formatDate(d) {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function render() {
    list.innerHTML = "";
    var shown = items.filter(function (a) {
      return current === "All" || a.topic === current;
    });
    if (limit) shown = shown.slice(0, limit);

    shown.forEach(function (a) {
      var li = el("li", "article");

      if (a.date) {
        var t = el("time", "", formatDate(a.date));
        t.setAttribute("datetime", a.date);
        li.appendChild(t);
      } else {
        li.appendChild(el("span", "undated", ""));
      }

      var body = el("div");
      var h = el("h3");
      var link = el("a", "", a.title);
      link.href = a.url;
      link.target = "_blank";
      link.rel = "noopener";
      h.appendChild(link);
      link.appendChild(el("span", "visually-hidden", " (opens in a new tab)"));
      body.appendChild(h);

      var meta = el("p", "meta");
      meta.appendChild(el("strong", "", a.source));
      meta.appendChild(document.createTextNode(a.topic));
      body.appendChild(meta);

      if (a.note) body.appendChild(el("p", "note", a.note));
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  var filters = document.querySelectorAll("[data-filter]");
  filters.forEach(function (btn) {
    btn.addEventListener("click", function () {
      current = btn.getAttribute("data-filter");
      filters.forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      render();
    });
  });

  render();
})();
