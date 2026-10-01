/* 瑞穂県ホームページ — page rendering, 編集モード, and 掲示板.
   Content lives in content.js; the relay address lives in config.js. */
(function () {
  "use strict";

  var C = null;            // the site content (window.MIZUHO_CONTENT)
  var EDIT = false;        // 編集モード on/off
  var PASS = "";           // passcode for this edit session
  var dirty = false;       // unsaved edits
  var previews = {};       // new image path -> data: URL (until GitHub Pages catches up)
  var RELAY = String(window.MIZUHO_RELAY || "").trim();
  var NONE = "なし";

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function str(v) { return String(v == null ? "" : v).trim(); }
  function get(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, C);
  }
  function set(path, value) {
    var ks = path.split("."), o = C;
    for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = value;
  }
  function list(path) { var a = get(path); return Array.isArray(a) ? a : []; }
  function val(path) { return str(get(path)); }

  // Editable text: <tag data-path>. Hidden when empty, except in edit mode.
  function tx(path, tag, cls) {
    var v = val(path);
    if (!v && !EDIT) return "";
    return "<" + tag + ' class="' + (cls || "") + '" data-path="' + path + '">' + esc(v) + "</" + tag + ">";
  }
  // Plain text that mirrors an editable value (inside buttons, which can't be edited).
  function mirror(path) { return '<span data-mirror="' + path + '">' + esc(val(path)) + "</span>"; }

  /* ---------- images ---------- */
  var EMBLEM_SVG =
    '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<circle cx="32" cy="32" r="24.5" fill="none" stroke="currentColor" stroke-width="1"/>' +
    '<path d="M32 53 C31 42 33 28 42 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M32 50 C26 47 21 46 16 47 C21 42 27 43 32 47" fill="currentColor"/>' +
    '<path d="M32 50 C38 46 44 45 48 46 C44 41 37 42 32 46" fill="currentColor"/>' +
    [[33, 40, -35], [34, 33, -30], [36, 26, -25], [39, 20, -20]].map(function (p) {
      return '<ellipse cx="' + (p[0] - 4.2) + '" cy="' + p[1] + '" rx="2.4" ry="4.4" transform="rotate(' + p[2] + " " + (p[0] - 4.2) + " " + p[1] + ')" fill="currentColor"/>' +
        '<ellipse cx="' + (p[0] + 4.4) + '" cy="' + (p[1] - 2) + '" rx="2.4" ry="4.4" transform="rotate(' + (p[2] + 70) + " " + (p[0] + 4.4) + " " + (p[1] - 2) + ')" fill="currentColor"/>';
    }).join("") +
    '<ellipse cx="43.5" cy="13" rx="2.3" ry="4.2" transform="rotate(35 43.5 13)" fill="currentColor"/></svg>';
  var SILHOUETTE =
    '<svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    '<rect width="120" height="160" fill="#e1e5eb"/><circle cx="60" cy="62" r="26" fill="#b5bdc9"/>' +
    '<path d="M12 160 C12 118 34 98 60 98 C86 98 108 118 108 160 Z" fill="#b5bdc9"/></svg>';
  var PICTURE_ICON =
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="8" width="40" height="32" rx="2" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<circle cx="16" cy="19" r="4" fill="currentColor"/><path d="M8 36 L20 25 L28 32 L34 27 L40 33 L40 36 Z" fill="currentColor"/></svg>';

  function placeholder(kind) {
    return kind === "person" ? SILHOUETTE
      : '<div class="ph-wide">' + PICTURE_ICON + "<span>" + esc(val("SITE.imagePlaceholder")) + "</span></div>";
  }
  function srcOf(src) { return previews[src] || src; }
  // An image slot bound to a content path. In edit mode it gets photo buttons.
  function pic(path, kind, altPath) {
    var src = val(path);
    if (src === NONE && !EDIT) return "";
    var empty = !src || src === NONE;
    var inner = empty ? placeholder(kind)
      : '<img src="' + esc(srcOf(src)) + '" alt="' + esc(altPath ? val(altPath) : "") + '" loading="lazy" data-kind="' + kind + '">';
    var tools = EDIT
      ? '<div class="img-tools"><button type="button" class="ebtn" data-act="img" data-path="' + path + '">写真をえらぶ</button>' +
        (empty ? "" : '<button type="button" class="ebtn" data-act="noimg" data-path="' + path + '">写真を消す</button>') + "</div>"
      : "";
    return '<div class="pic-slot"><div class="pic pic-' + kind + (empty ? " is-empty" : "") + '">' + inner + "</div>" + tools + "</div>";
  }
  function figure(path, capPath) {
    if (val(path) === NONE && !EDIT) return "";
    return '<figure class="fig">' + pic(path, "wide", capPath) + (capPath ? tx(capPath, "figcaption") : "") + "</figure>";
  }
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (img && img.tagName === "IMG" && img.getAttribute("data-kind")) {
      var box = img.parentNode;
      box.classList.add("is-empty");
      box.innerHTML = placeholder(img.getAttribute("data-kind"));
    }
  }, true);

  /* ---------- list editing controls ---------- */
  function tools(listPath, i, n) {
    if (!EDIT) return "";
    var d = ' data-list="' + listPath + '" data-i="' + i + '"';
    return '<div class="tools"><button type="button" class="ebtn" data-act="up"' + d + (i === 0 ? " disabled" : "") + ">↑ 上へ</button>" +
      '<button type="button" class="ebtn" data-act="down"' + d + (i === n - 1 ? " disabled" : "") + ">↓ 下へ</button>" +
      '<button type="button" class="ebtn danger" data-act="del"' + d + ">削除</button></div>";
  }
  function addBtn(listPath, label) {
    return EDIT ? '<button type="button" class="ebtn add" data-act="add" data-list="' + listPath + '">＋ ' + esc(label) + "を追加</button>" : "";
  }
  var BLANK = {
    "ABOUT.history.paragraphs": "（新しい段落）",
    "ABOUT.history.timeline": { year: "（〇〇年）", text: "（出来事）" },
    "ABOUT.overview.facts": { label: "（項目）", value: "（内容）" },
    "ABOUT.overview.topics": { heading: "（見出し）", text: "（説明）", image: "", imageCaption: "（画像の説明）" },
    "ABOUT.overview.symbols": { label: "（種類）", name: "（名前）", text: "（説明）", image: "" },
    "ABOUT.leaders.groups": { heading: "（グループ名）", people: [] },
    "ABOUT.leaders.groups.*.people": { image: "", name: "（氏名）", title: "（役職名）", term: "（〇〇年〜〇〇年）", bio: "（ここに経歴を書いてください。）" },
    "TRANSIT.sections": { heading: "（交通の種類）", description: "（説明）", history: "（歴史）", linesHeading: "主な路線", lines: [], images: [] },
    "TRANSIT.sections.*.lines": { name: "（名称）", text: "（内容）" },
    "TRANSIT.sections.*.images": { src: "", caption: "（画像の説明）" },
    "CITIES.list": { name: "（市町村名）", mayorTitle: "市長", mayorName: "（氏名）", mayorImage: "", text: "（ここに市と市長について書いてください。）" },
    "CITIES.wanted.list": { image: "", name: "（氏名）", crime: "（罪状）", reward: "（〇〇万円）", details: "（ここに特徴などを書いてください。）" },
    "BOARD.rules": "（新しいルール）",
  };
  function blankFor(listPath) {
    var key = listPath.replace(/\.\d+\./g, ".*.");
    return JSON.parse(JSON.stringify(BLANK[key] !== undefined ? BLANK[key] : "（入力してください）"));
  }

  /* ---------- page pieces ---------- */
  function pageHead(key) {
    return '<ol class="crumbs"><li>' + mirror("SITE.home") + "</li><li>" + mirror(key + ".title") + "</li></ol>" +
      tx(key + ".title", "h1", "page-title") +
      (EDIT ? '<p class="edit-note">メニューに表示する名前：' + tx(key + ".navLabel", "span", "inline-edit") + "</p>" : "") +
      tx(key + ".lead", "p", "lead");
  }
  function toc(items) {
    return '<nav class="toc"><p class="toc-label">' + mirror("SITE.pageLinks") + '</p><div class="chips">' +
      items.map(function (i) { return '<button type="button" class="chip" data-jump="' + i.id + '">' + mirror(i.path) + "</button>"; }).join("") +
      "</div></nav>";
  }
  function longText(path) {
    return tx(path, "p", "bio" + (EDIT ? "" : " clamp")) +
      (EDIT ? "" : '<button type="button" class="more" hidden>' + esc(val("SITE.readMore")) + "</button>");
  }
  function hasFig(path) { return val(path) !== NONE || EDIT; }

  /* ---------- Page 1 ---------- */
  function renderAbout() {
    var html = pageHead("ABOUT") + toc([
      { id: "about-history", path: "ABOUT.history.heading" },
      { id: "about-overview", path: "ABOUT.overview.heading" },
      { id: "about-leaders", path: "ABOUT.leaders.heading" },
    ]);
    var paras = list("ABOUT.history.paragraphs");
    html += '<section class="block" id="about-history">' + tx("ABOUT.history.heading", "h2", "sec") +
      '<div class="split' + (hasFig("ABOUT.history.image") ? " has-fig" : "") + '"><div class="prose">' +
      paras.map(function (p, i) { return '<div class="item-row">' + tx("ABOUT.history.paragraphs." + i, "p") + tools("ABOUT.history.paragraphs", i, paras.length) + "</div>"; }).join("") +
      addBtn("ABOUT.history.paragraphs", "段落") + "</div>" + figure("ABOUT.history.image", "ABOUT.history.imageCaption") + "</div>" +
      tx("ABOUT.history.timelineHeading", "h3", "sub");
    var tl = list("ABOUT.history.timeline");
    html += '<ol class="timeline">' + tl.map(function (e, i) {
      var p = "ABOUT.history.timeline." + i;
      return "<li>" + tx(p + ".year", "span", "tl-year") + "<span>" + tx(p + ".text", "span") + tools("ABOUT.history.timeline", i, tl.length) + "</span></li>";
    }).join("") + "</ol>" + addBtn("ABOUT.history.timeline", "年表の行") + "</section>";

    var facts = list("ABOUT.overview.facts"), topics = list("ABOUT.overview.topics"), syms = list("ABOUT.overview.symbols");
    html += '<section class="block" id="about-overview">' + tx("ABOUT.overview.heading", "h2", "sec") +
      tx("ABOUT.overview.factsHeading", "h3", "sub") + '<dl class="facts">' +
      facts.map(function (f, i) {
        var p = "ABOUT.overview.facts." + i;
        return '<div class="fact">' + tx(p + ".label", "dt") + tx(p + ".value", "dd") + tools("ABOUT.overview.facts", i, facts.length) + "</div>";
      }).join("") + "</dl>" + addBtn("ABOUT.overview.facts", "データ") +
      topics.map(function (tp, i) {
        var p = "ABOUT.overview.topics." + i;
        return tools("ABOUT.overview.topics", i, topics.length) + tx(p + ".heading", "h3", "sub") +
          '<div class="split' + (hasFig(p + ".image") ? " has-fig" : "") + '"><div class="prose">' + tx(p + ".text", "p") + "</div>" +
          figure(p + ".image", p + ".imageCaption") + "</div>";
      }).join("") + addBtn("ABOUT.overview.topics", "トピック") +
      tx("ABOUT.overview.symbolsHeading", "h3", "sub") + '<div class="symbols">' +
      syms.map(function (s, i) {
        var p = "ABOUT.overview.symbols." + i;
        return '<div class="symbol">' + tools("ABOUT.overview.symbols", i, syms.length) + pic(p + ".image", "square", p + ".name") +
          tx(p + ".label", "span", "tag") + tx(p + ".name", "div", "symbol-name") + tx(p + ".text", "p") + "</div>";
      }).join("") + "</div>" + addBtn("ABOUT.overview.symbols", "シンボル") + "</section>";

    var groups = list("ABOUT.leaders.groups");
    html += '<section class="block" id="about-leaders">' + tx("ABOUT.leaders.heading", "h2", "sec") +
      '<div class="prose">' + tx("ABOUT.leaders.lead", "p") + "</div>" +
      groups.map(function (g, gi) {
        var gp = "ABOUT.leaders.groups." + gi, people = list(gp + ".people");
        return tools("ABOUT.leaders.groups", gi, groups.length) +
          '<h3 class="sub">' + tx(gp + ".heading", "span") + '<span class="count">' + people.length + esc(val("SITE.peopleCount")) + "</span></h3>" +
          '<div class="grid">' + people.map(function (pp, i) {
            var p = gp + ".people." + i;
            return '<article class="pcard">' + tools(gp + ".people", i, people.length) + pic(p + ".image", "person", p + ".name") +
              '<div class="meta">' + tx(p + ".title", "div", "p-title") + tx(p + ".name", "div", "p-name") +
              '<div class="p-term">' + tx("SITE.term", "b") + tx(p + ".term", "span") + "</div></div>" +
              '<div class="full">' + longText(p + ".bio") + "</div></article>";
          }).join("") + "</div>" + addBtn(gp + ".people", "人物");
      }).join("") + addBtn("ABOUT.leaders.groups", "グループ") + "</section>";
    $("#page-about").innerHTML = html;
  }

  /* ---------- Page 2 ---------- */
  function renderTransit() {
    var secs = list("TRANSIT.sections");
    var html = pageHead("TRANSIT") + toc(secs.map(function (s, i) { return { id: "transit-" + i, path: "TRANSIT.sections." + i + ".heading" }; }));
    html += secs.map(function (s, i) {
      var p = "TRANSIT.sections." + i, imgs = list(p + ".images"), lines = list(p + ".lines");
      var shown = imgs.map(function (im, j) { return { j: j, src: str(im.src) }; }).filter(function (x) { return EDIT || x.src !== NONE; });
      return '<section class="block" id="transit-' + i + '">' + tools("TRANSIT.sections", i, secs.length) + tx(p + ".heading", "h2", "sec") +
        '<div class="prose">' + tx(p + ".description", "p") + "</div>" +
        (shown.length ? '<div class="figs">' + shown.map(function (x) {
          return "<div>" + figure(p + ".images." + x.j + ".src", p + ".images." + x.j + ".caption") + tools(p + ".images", x.j, imgs.length) + "</div>";
        }).join("") + "</div>" : "") + addBtn(p + ".images", "画像") +
        tx("TRANSIT.historyHeading", "h3", "sub") + '<div class="prose">' + tx(p + ".history", "p") + "</div>" +
        ((lines.length || EDIT) ? tx(p + ".linesHeading", "h3", "sub") + '<div class="table-wrap"><table class="lines"><thead><tr><th scope="col">' +
          tx("SITE.lineName", "span") + '</th><th scope="col">' + tx("SITE.lineNote", "span") + "</th></tr></thead><tbody>" +
          lines.map(function (l, j) {
            var lp = p + ".lines." + j;
            return '<tr><th scope="row">' + tx(lp + ".name", "span") + "</th><td>" + tx(lp + ".text", "span") + tools(p + ".lines", j, lines.length) + "</td></tr>";
          }).join("") + "</tbody></table></div>" + addBtn(p + ".lines", "路線") : "") +
        "</section>";
    }).join("") + addBtn("TRANSIT.sections", "交通の種類");
    $("#page-transit").innerHTML = html;
  }

  /* ---------- Page 3 ---------- */
  function renderCities() {
    var cities = list("CITIES.list"), wanted = list("CITIES.wanted.list");
    var html = pageHead("CITIES") + toc([{ id: "cities-list", path: "CITIES.citiesHeading" }, { id: "cities-wanted", path: "CITIES.wanted.heading" }]);
    html += '<section class="block" id="cities-list">' + tx("CITIES.citiesHeading", "h2", "sec") +
      '<div class="prose">' + tx("CITIES.citiesLead", "p") + "</div>" +
      '<h3 class="sub">' + tx("CITIES.indexLabel", "span") + '<span class="count">' + cities.length + "</span></h3>" +
      '<div class="chips city-index">' + cities.map(function (c, i) {
        return '<button type="button" class="chip" data-jump="city-' + (i + 1) + '">' + mirror("CITIES.list." + i + ".name") + "</button>";
      }).join("") + '</div><div class="grid">' +
      cities.map(function (c, i) {
        var p = "CITIES.list." + i;
        return '<article class="ccard" id="city-' + (i + 1) + '">' + tools("CITIES.list", i, cities.length) + tx(p + ".name", "div", "ccard-head") +
          '<div class="ccard-body">' + pic(p + ".mayorImage", "person", p + ".mayorName") +
          '<div class="meta">' + tx(p + ".mayorTitle", "div", "p-title") + tx(p + ".mayorName", "div", "p-name") + "</div>" +
          '<div class="full">' + longText(p + ".text") + "</div></div></article>";
      }).join("") + "</div>" + addBtn("CITIES.list", "市町村") + "</section>";

    html += '<section class="block" id="cities-wanted">' + tx("CITIES.wanted.heading", "h2", "sec") +
      '<div class="prose">' + tx("CITIES.wanted.lead", "p") + "</div>" + '<div class="wanted-grid">' +
      wanted.map(function (w, i) {
        var p = "CITIES.wanted.list." + i;
        return '<article class="wcard">' + tools("CITIES.wanted.list", i, wanted.length) + tx("CITIES.wanted.banner", "div", "w-banner") +
          '<div class="w-body">' + pic(p + ".image", "person", p + ".name") + tx(p + ".name", "div", "w-name") +
          '<dl class="w-facts"><div class="w-row">' + tx("CITIES.wanted.crimeLabel", "dt") + tx(p + ".crime", "dd") + "</div>" +
          '<div class="w-row w-reward">' + tx("CITIES.wanted.rewardLabel", "dt") + tx(p + ".reward", "dd") + "</div></dl>" +
          "<div>" + longText(p + ".details") + "</div></div>" +
          '<div class="w-foot">' + tx("CITIES.wanted.issuer", "div", "w-issuer") + tx("CITIES.wanted.contact", "div", "w-contact") + "</div></article>";
      }).join("") + "</div>" + addBtn("CITIES.wanted.list", "指名手配") + "</section>";
    $("#page-cities").innerHTML = html;
  }

  /* ---------- Page 4 (layout; posts load separately) ---------- */
  function renderBoardShell() {
    var savedName = "";
    try { savedName = localStorage.getItem("mizuho-board-name") || ""; } catch (e) {}
    var rules = list("BOARD.rules");
    $("#page-board").innerHTML = pageHead("BOARD") +
      '<section class="rules">' + tx("BOARD.rulesHeading", "h2") + "<ul>" +
      rules.map(function (r, i) { return "<li>" + tx("BOARD.rules." + i, "span") + tools("BOARD.rules", i, rules.length) + "</li>"; }).join("") +
      "</ul>" + addBtn("BOARD.rules", "ルール") + "</section>" +
      '<nav class="toc"><div class="chips"><button type="button" class="chip" data-jump="board-latest">' + mirror("BOARD.jumpLatest") +
      '</button><button type="button" class="chip" data-jump="board-form">' + mirror("BOARD.jumpForm") + "</button></div></nav>" +
      '<section class="block">' + tx("BOARD.threadHeading", "h2", "sec") +
      '<div class="thread" id="thread" aria-live="polite"><p class="thread-note">' + esc(val("BOARD.loading")) + "</p></div></section>" +
      '<form class="form block" id="board-form" novalidate>' + tx("BOARD.formHeading", "h2") +
      '<div class="field"><label for="board-name">' + mirror("BOARD.nameLabel") + '</label><input id="board-name" type="text" maxlength="30" autocomplete="off" placeholder="' +
      esc(val("BOARD.namePlaceholder")) + '" value="' + esc(savedName) + '"></div>' +
      '<div class="field"><label for="board-message">' + mirror("BOARD.messageLabel") + '</label><textarea id="board-message" maxlength="1000" placeholder="' +
      esc(val("BOARD.messagePlaceholder")) + '"></textarea></div>' +
      '<button type="submit" class="submit" id="board-submit">' + esc(val("BOARD.submit")) + "</button>" +
      '<p class="status" id="board-status" role="status"></p></form>';
    $("#board-form").addEventListener("submit", function (e) { Board.submit(e); });
  }

  function renderChrome() {
    var emblem = val("SITE.emblem");
    $("#emblem").innerHTML = (emblem && emblem !== NONE ? '<img src="' + esc(srcOf(emblem)) + '" alt="">' : EMBLEM_SVG) +
      (EDIT ? '<button type="button" class="ebtn emblem-btn" data-act="img" data-path="SITE.emblem">県章</button>' : "");
    $("#brand").innerHTML = tx("SITE.name", "div", "pref-name") + tx("SITE.kana", "div", "pref-kana");
    $("#tagline").innerHTML = tx("SITE.tagline", "span");
    $("#toTop").innerHTML = "▲ " + mirror("SITE.toTop");
    $("#navList").innerHTML = [["about", "ABOUT"], ["transit", "TRANSIT"], ["cities", "CITIES"], ["board", "BOARD"]].map(function (p) {
      return '<li><button type="button" class="gnav-btn" data-page="' + p[0] + '">' + mirror(p[1] + ".navLabel") + "</button></li>";
    }).join("");
    $("#footer").innerHTML = tx("SITE.footer.office", "p", "f-office") + tx("SITE.footer.address", "p", "f-small") +
      tx("SITE.footer.tel", "p", "f-small") + tx("SITE.footer.hours", "p", "f-small") + tx("SITE.footer.note", "p", "f-note") +
      tx("SITE.footer.copyright", "p", "f-note") +
      '<p class="f-edit"><button type="button" class="f-edit-btn" id="editOpen">' + (EDIT ? "編集モード中" : "編集") + "</button></p>";
  }

  function renderAll() {
    document.body.classList.toggle("editing", EDIT);
    renderChrome(); renderAbout(); renderTransit(); renderCities(); renderBoardShell();
    $$("[data-path]").forEach(function (el) {
      if (EDIT) { el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "false"); }
    });
    if (Board.started) Board.render();
  }

  /* ---------- 続きを読む ---------- */
  function updateClamps(root) {
    $$(".bio.clamp", root).forEach(function (p) {
      var btn = p.nextElementSibling;
      if (btn && btn.classList.contains("more")) btn.hidden = !(p.scrollHeight > p.clientHeight + 2);
    });
  }

  /* ---------- page switching ---------- */
  var PAGES = ["about", "transit", "cities", "board"];
  var KEYS = { about: "ABOUT", transit: "TRANSIT", cities: "CITIES", board: "BOARD" };
  var current = null;
  function show(id, keepScroll) {
    if (PAGES.indexOf(id) < 0) id = "about";
    current = id;
    PAGES.forEach(function (p) { $("#page-" + p).hidden = p !== id; });
    $$(".gnav-btn").forEach(function (b) {
      if (b.getAttribute("data-page") === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.title = val(KEYS[id] + ".title") + "｜" + val("SITE.name");
    if (!keepScroll) {
      try { history.replaceState(null, "", EDIT ? "#edit" : "#" + id); } catch (e) {}
      window.scrollTo(0, 0);
    }
    updateClamps($("#page-" + id));
    if (id === "board") Board.onShow();
  }
  function rerender() {
    var y = window.scrollY;
    renderAll();
    show(current, true);
    window.scrollTo(0, y);
  }

  /* ---------- clicks ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("button") : null;
    if (!el) return;
    if (el.classList.contains("gnav-btn")) { show(el.getAttribute("data-page")); return; }
    if (el.hasAttribute("data-jump")) {
      var id = el.getAttribute("data-jump");
      var target = id === "board-latest" ? ($("#thread .post:last-child") || $("#thread")) : document.getElementById(id);
      if (target) target.scrollIntoView({ block: "start" });
      return;
    }
    if (el.classList.contains("more")) {
      var p = el.previousElementSibling, open = p.classList.toggle("clamp") === false;
      el.textContent = val(open ? "SITE.readLess" : "SITE.readMore");
      return;
    }
    if (el.id === "toTop") { window.scrollTo(0, 0); return; }
    if (el.id === "editOpen") { Edit.openLogin(); return; }
    var act = el.getAttribute("data-act");
    if (act && EDIT) Edit.act(act, el);
  });
  window.addEventListener("hashchange", function () {
    var h = (location.hash || "").slice(1);
    if (h === "edit") Edit.openLogin();
    else if (PAGES.indexOf(h) >= 0 && h !== current) show(h, true);
  });
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (current) updateClamps($("#page-" + current)); }, 200);
  });

  /* =====================================================================
     Relay: the Google Apps Script web app (relay/Code.gs).
     Board posts and 編集モード saves both go through it.
     ===================================================================== */
  var Relay = {
    ready: function () { return !!RELAY; },
    get: function (action) {
      return fetch(RELAY + "?action=" + encodeURIComponent(action) + "&t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.json(); });
    },
    // text/plain keeps this a "simple" request, which Apps Script accepts from other sites.
    post: function (obj) {
      return fetch(RELAY, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(obj) })
        .then(function (r) { return r.json(); });
    },
  };

  /* =====================================================================
     編集モード
     ===================================================================== */
  var Edit = {
    openLogin: function () {
      if (EDIT) return;
      var panel = $("#login");
      panel.hidden = false;
      if (!Relay.ready()) {
        panel.innerHTML = '<p class="login-msg">編集モードはまだ準備中です（config.js にリレーのURLがありません）。</p>';
        return;
      }
      var saved = "";
      try { saved = sessionStorage.getItem("mizuho-pass") || ""; } catch (e) {}
      panel.innerHTML = '<form id="loginForm" class="login-form"><label for="pass">編集用パスコード</label>' +
        '<input id="pass" type="password" autocomplete="current-password" value="' + esc(saved) + '">' +
        '<button type="submit" class="ebtn primary">編集をはじめる</button><button type="button" class="ebtn" id="loginCancel">やめる</button>' +
        '<p class="login-msg" id="loginMsg" role="status"></p></form>';
      $("#loginCancel").addEventListener("click", function () { panel.hidden = true; });
      $("#loginForm").addEventListener("submit", function (e) { e.preventDefault(); Edit.login($("#pass").value); });
      window.scrollTo(0, 0);
      $("#pass").focus();
    },
    login: function (pass) {
      var msg = $("#loginMsg");
      msg.textContent = "確認しています…";
      Relay.post({ action: "content", passcode: pass }).then(function (r) {
        if (!r.ok) { msg.textContent = Edit.errorText(r.error); return; }
        PASS = pass;
        try { sessionStorage.setItem("mizuho-pass", pass); } catch (e) {}
        C = r.content;                 // freshest copy, straight from GitHub
        EDIT = true;
        $("#login").hidden = true;
        $("#editbar").hidden = false;
        Edit.status("編集モードです。文字をタップして書きかえられます。終わったら「保存」を押してください。");
        rerender();
      }, function () { msg.textContent = "接続できませんでした。インターネット接続を確認してください。"; });
    },
    status: function (text, kind) {
      var s = $("#editStatus");
      s.textContent = text;
      s.className = "edit-status" + (kind ? " " + kind : "");
    },
    markDirty: function () {
      dirty = true;
      $("#saveBtn").disabled = false;
      Edit.status("保存していない変更があります。");
    },
    act: function (act, el) {
      var lp = el.getAttribute("data-list"), i = Number(el.getAttribute("data-i"));
      if (act === "img") { Edit.pickImage(el.getAttribute("data-path")); return; }
      if (act === "noimg") { set(el.getAttribute("data-path"), ""); Edit.markDirty(); rerender(); return; }
      var arr = lp ? get(lp) : null;
      if (act === "add") { if (!Array.isArray(arr)) { set(lp, []); arr = get(lp); } arr.push(blankFor(lp)); }
      else if (act === "up" && i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
      else if (act === "down" && i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
      else if (act === "del") {
        if (!el.classList.contains("armed")) {
          el.classList.add("armed"); el.textContent = "もう一度押すと削除";
          setTimeout(function () { if (el.isConnected) { el.classList.remove("armed"); el.textContent = "削除"; } }, 4000);
          return;
        }
        arr.splice(i, 1);
      } else return;
      Edit.markDirty();
      rerender();
    },
    pickImage: function (path) {
      var input = $("#filePick");
      input.value = "";
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) return;
        Edit.status("写真を準備しています…");
        compress(file).then(function (dataUrl) {
          var name = "images/p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6) + ".jpg";
          previews[name] = dataUrl;
          set(path, name);
          Edit.markDirty();
          rerender();
        }, function () { Edit.status("この写真は読みこめませんでした。JPGかPNGの写真をえらんでください。", "err"); });
      };
      input.click();
    },
    save: function (force) {
      var btn = $("#saveBtn");
      btn.disabled = true;
      Edit.status("保存しています…");
      var used = {}, images = [];
      JSON.stringify(C, function (k, v) { if (typeof v === "string" && previews[v]) used[v] = true; return v; });
      Object.keys(used).forEach(function (p) { images.push({ path: p, data: previews[p].split(",")[1] }); });
      Relay.post({ action: "save", passcode: PASS, rev: (C.meta && C.meta.rev) || 0, force: !!force, content: C, images: images })
        .then(function (r) {
          if (r.ok) {
            C.meta = C.meta || {}; C.meta.rev = r.rev;
            dirty = false;
            Edit.status("保存しました。サイトに反映されるまで1〜2分かかります。", "ok");
            return;
          }
          btn.disabled = false;
          if (r.error === "conflict") {
            Edit.status("ほかの場所でサイトが更新されていました。あなたの変更はまだ消えていません。", "err");
            $("#forceBtn").hidden = false;
          } else Edit.status(Edit.errorText(r.error), "err");
        }, function () {
          btn.disabled = false;
          Edit.status("保存できませんでした。インターネット接続を確認して、もう一度「保存」を押してください。", "err");
        });
    },
    exit: function () {
      var btn = $("#exitBtn");
      if (dirty && !btn.classList.contains("armed")) {
        btn.classList.add("armed"); btn.textContent = "保存せずに終わる？";
        setTimeout(function () { btn.classList.remove("armed"); btn.textContent = "編集を終わる"; }, 4000);
        return;
      }
      btn.classList.remove("armed"); btn.textContent = "編集を終わる";
      EDIT = false; dirty = false; PASS = "";
      $("#editbar").hidden = true; $("#forceBtn").hidden = true;
      try { history.replaceState(null, "", "#" + current); } catch (e) {}
      rerender();
    },
    errorText: function (code) {
      return ({
        auth: "パスコードがちがいます。",
        locked: "まちがいが多すぎました。10分ほど待ってから、もう一度ためしてください。",
        no_token: "リレーにGitHubのキーが設定されていません（管理者に連絡してください）。",
        too_large: "データが大きすぎます。写真の数を減らしてから保存してください。",
      })[code] || "エラーが起きました（" + String(code || "不明") + "）。";
    },
  };
  // Typing into any editable text updates the content (and any copies of it on the page).
  document.addEventListener("input", function (e) {
    var el = e.target.closest ? e.target.closest("[data-path]") : null;
    if (!el || !EDIT) return;
    var path = el.getAttribute("data-path"), v = el.innerText.replace(/ /g, " ").replace(/\n$/, "");
    set(path, v);
    $$('[data-path="' + path + '"]').forEach(function (o) { if (o !== el) o.textContent = v; });
    $$('[data-mirror="' + path + '"]').forEach(function (o) { o.textContent = v.trim(); });
    if (!dirty) Edit.markDirty();
  });
  // Paste as plain text, so formatting from other apps doesn't come along.
  document.addEventListener("paste", function (e) {
    var el = e.target.closest ? e.target.closest("[data-path]") : null;
    if (!el || !EDIT || !e.clipboardData) return;
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  function compress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1200, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        var x = c.getContext("2d");
        x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);   // transparent PNGs get a white background
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  /* =====================================================================
     掲示板
     ===================================================================== */
  function fmtDate(ms) {
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return "";
    try {
      var parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
      var g = function (k) { for (var i = 0; i < parts.length; i++) if (parts[i].type === k) return parts[i].value; return ""; };
      var hh = g("hour"); if (hh === "24") hh = "00";
      return g("year") + "年" + Number(g("month")) + "月" + Number(g("day")) + "日 " + ("0" + Number(hh)).slice(-2) + ":" + ("0" + Number(g("minute"))).slice(-2);
    } catch (e) {
      return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    }
  }
  function normalize(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (r) {
      return { id: String(r.id || ""), name: String(r.name || ""), body: String(r.body || ""), at: Number(r.at) || 0 };
    });
  }

  var Board = {
    posts: [], started: false, busy: false, scrollToLast: false, loaded: false, timer: null,
    onShow: function () {
      if (!this.started) {
        this.started = true;
        if (!Relay.ready()) { this.unavailable(); return; }
        this.timer = setInterval(function () { Board.refresh(); }, 20000);
      }
      this.refresh();
    },
    refresh: function () {
      if (!Relay.ready() || document.hidden || current !== "board") return;
      Relay.get("posts").then(function (r) {
        if (!r.ok) throw new Error(r.error);
        Board.posts = normalize(r.posts); Board.loaded = true; Board.render();
      }).catch(function () { if (!Board.loaded) Board.unavailable(); });
    },
    unavailable: function () {
      $("#thread").innerHTML = '<p class="thread-note">' + esc(val("BOARD.unavailable")) + "</p>";
      $("#board-form").hidden = true;
    },
    render: function () {
      var box = $("#thread");
      if (!box) return;
      if (!this.loaded) { if (!Relay.ready()) this.unavailable(); return; }
      if (!this.posts.length) { box.innerHTML = '<p class="thread-empty">' + esc(val("BOARD.empty")) + "</p>"; return; }
      var dflt = val("BOARD.defaultName");
      box.innerHTML = this.posts.map(function (p, i) {
        return '<article class="post"><div class="post-head"><span class="post-no">' + (i + 1) + "</span>" +
          '<span class="post-label">' + esc(val("BOARD.namePrefix")) + '</span><span class="post-name">' + esc(p.name.trim() || dflt) + "</span>" +
          (EDIT ? '<button type="button" class="post-del" data-del="' + esc(p.id) + '">' + esc(val("BOARD.del")) + "</button>" : "") +
          '</div><div class="post-body">' + esc(p.body) + '</div><div class="post-date">' + esc(fmtDate(p.at)) + "</div></article>";
      }).join("");
      if (this.scrollToLast) {
        this.scrollToLast = false;
        var last = $("#thread .post:last-child");
        if (last) last.scrollIntoView({ block: "center" });
      }
    },
    status: function (msg, kind) {
      var s = $("#board-status");
      s.textContent = msg || "";
      s.className = "status" + (kind ? " " + kind : "");
    },
    submit: function (e) {
      e.preventDefault();
      if (this.busy || !Relay.ready()) return;
      var name = $("#board-name").value.trim().slice(0, 30);
      var body = $("#board-message").value.replace(/^\s+|\s+$/g, "");
      if (!body) { this.status(val("BOARD.errEmpty"), "err"); return; }
      if (body.length > 1000) { this.status(val("BOARD.errTooLong"), "err"); return; }
      var btn = $("#board-submit");
      this.busy = true; btn.disabled = true; btn.textContent = val("BOARD.sending"); this.status("");
      Relay.post({ action: "post", name: name, body: body }).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        $("#board-message").value = "";
        try { localStorage.setItem("mizuho-board-name", name); } catch (x) {}
        Board.posts = normalize(r.posts); Board.loaded = true; Board.scrollToLast = true; Board.render();
        Board.status(val("BOARD.posted"), "ok");
      }).catch(function () {
        Board.status(val("BOARD.errFailed"), "err");
      }).then(function () {
        Board.busy = false; btn.disabled = false; btn.textContent = val("BOARD.submit");
      });
    },
  };
  // Deleting a post (編集モード only): tap twice.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".post-del") : null;
    if (!btn || !EDIT) return;
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed"); btn.textContent = val("BOARD.delConfirm");
      setTimeout(function () { if (btn.isConnected && !btn.disabled) { btn.classList.remove("armed"); btn.textContent = val("BOARD.del"); } }, 4000);
      return;
    }
    btn.disabled = true;
    Relay.post({ action: "deletePost", passcode: PASS, id: btn.getAttribute("data-del") }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      Board.posts = normalize(r.posts); Board.render();
    }).catch(function () { btn.disabled = false; Board.status(val("BOARD.errFailed"), "err"); });
  });

  /* ---------- start ---------- */
  window.MizuhoApp = {
    start: function (content) {
      C = content;
      if (!C || !C.SITE) { document.getElementById("main").textContent = "ページを読みこめませんでした。もう一度開いてください。"; return; }
      $("#saveBtn").addEventListener("click", function () { Edit.save(false); });
      $("#forceBtn").addEventListener("click", function () { $("#forceBtn").hidden = true; Edit.save(true); });
      $("#exitBtn").addEventListener("click", function () { Edit.exit(); });
      renderAll();
      var h = (location.hash || "").slice(1);
      show(PAGES.indexOf(h) >= 0 ? h : "about", true);
      if (h === "edit") Edit.openLogin();
      window.addEventListener("load", function () { if (current) updateClamps($("#page-" + current)); });
    },
  };
})();
