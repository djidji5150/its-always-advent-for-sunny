(function () {
  "use strict";

  var TZ = "Europe/Sarajevo";
  var YEAR = 2026;
  var FIRST_DAY = 6;
  var LAST_DAY = 30;
  var UNLOCK_HOUR = 8;
  var MAGIC_DAY = YEAR + "-12-25";
  var STORAGE_KEY = "sunny-advent-opened";

  var dates = [];
  for (var day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    dates.push(YEAR + "-12-" + String(day).padStart(2, "0"));
  }

  var doorsRoot = document.getElementById("doors");
  var statusEl = document.getElementById("status");
  var previewEl = document.getElementById("preview-banner");
  var toastEl = document.getElementById("toast");
  var dialog = document.getElementById("recipe");
  var buttons = new Map();
  var toastTimer = 0;
  var previewLabel = "";

  function timeZoneOffsetMs(date) {
    var dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    var parts = {};
    dtf.formatToParts(date).forEach(function (part) {
      if (part.type !== "literal") parts[part.type] = part.value;
    });
    var asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second)
    );
    return asUTC - date.getTime();
  }

  function zonedDateTime(isoDate, hour, minute) {
    var bits = isoDate.split("-").map(Number);
    var utcGuess = Date.UTC(bits[0], bits[1] - 1, bits[2], hour, minute || 0, 0);
    var offset = timeZoneOffsetMs(new Date(utcGuess));
    var result = utcGuess - offset;
    var corrected = timeZoneOffsetMs(new Date(result));
    if (corrected !== offset) result = utcGuess - corrected;
    return new Date(result);
  }

  function localISO(date) {
    var parts = {};
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .forEach(function (part) {
        if (part.type !== "literal") parts[part.type] = part.value;
      });
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function formatWhen(iso) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(zonedDateTime(iso, 12));
  }

  function unit(value, word) {
    return value + " " + (value === 1 ? word : word + "s");
  }

  function formatDistance(ms) {
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return (
      unit(days, "day") +
      ", " +
      unit(hours, "hour") +
      ", " +
      unit(minutes, "minute") +
      " and " +
      unit(seconds, "second")
    );
  }

  function isISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var bits = value.split("-").map(Number);
    var check = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2]));
    return (
      check.getUTCFullYear() === bits[0] &&
      check.getUTCMonth() === bits[1] - 1 &&
      check.getUTCDate() === bits[2]
    );
  }

  function getNow() {
    var params = new URLSearchParams(window.location.search);
    var preview = params.get("preview");
    if (preview === "open") {
      previewLabel = "Previewing the finished calendar, as if it were midday on 30 December. Send Sunny the link without this preview.";
      return zonedDateTime(YEAR + "-12-30", 12);
    }
    if (preview && isISODate(preview)) {
      previewLabel = "Previewing " + formatWhen(preview) + " at midday. Send Sunny the link without this preview.";
      return zonedDateTime(preview, 12);
    }
    previewLabel = "";
    return new Date();
  }

  function recipeFor(date) {
    var all = window.RECIPES || {};
    var recipe = all[date];
    if (!recipe || typeof recipe.title !== "string" || !recipe.title.trim()) return null;
    return recipe;
  }

  function readOpened() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch (error) {
      return new Set();
    }
  }

  function markOpened(date) {
    var opened = readOpened();
    opened.add(date);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(opened)));
    } catch (error) {
      /* private mode can refuse storage; the door still opens */
    }
  }

  function doorState(date, now, opened) {
    var unlockAt = zonedDateTime(date, UNLOCK_HOUR);
    var today = localISO(now);
    var unlocked = now.getTime() >= unlockAt.getTime();
    var ready = Boolean(recipeFor(date));
    var read = opened.has(date) && ready;
    var label = "Locked";
    if (!unlocked && date === today) label = "At 8";
    else if (unlocked && !ready) label = "Soon";
    else if (unlocked && read) label = "Opened";
    else if (unlocked) label = "Open";
    return {
      unlocked: unlocked,
      ready: ready,
      read: read,
      today: date === today,
      label: label,
      unlockAt: unlockAt,
    };
  }

  function statusMessage(now) {
    var firstUnlock = zonedDateTime(dates[0], UNLOCK_HOUR);
    var lastUnlock = zonedDateTime(dates[dates.length - 1], UNLOCK_HOUR);
    if (now.getTime() < firstUnlock.getTime()) {
      return (
        "The first door opens on " +
        formatWhen(dates[0]) +
        " at 8:00 — " +
        formatDistance(firstUnlock.getTime() - now.getTime()) +
        " from now."
      );
    }
    if (now.getTime() >= lastUnlock.getTime() && localISO(now) > dates[dates.length - 1]) {
      return "The calendar is complete. Every door stays open.";
    }
    var today = localISO(now);
    if (dates.indexOf(today) !== -1) {
      var unlockAt = zonedDateTime(today, UNLOCK_HOUR);
      if (now.getTime() < unlockAt.getTime()) {
        return "Today’s door opens in " + formatDistance(unlockAt.getTime() - now.getTime()) + ".";
      }
      if (recipeFor(today)) return "Today’s meal is on the table.";
      return "Today’s door is open. The recipe is on its way.";
    }
    if (now.getTime() >= lastUnlock.getTime()) return "The calendar is complete. Every door stays open.";
    return "A new door opens every morning at 8:00.";
  }

  function paint() {
    var now = getNow();
    var opened = readOpened();
    var today = localISO(now);
    statusEl.textContent = statusMessage(now);
    previewEl.hidden = !previewLabel;
    previewEl.textContent = previewLabel;

    buttons.forEach(function (button, date) {
      var state = doorState(date, now, opened);
      button.classList.toggle("is-locked", !state.unlocked);
      button.classList.toggle("is-today", state.today);
      button.classList.toggle("is-ready", state.unlocked && state.ready && !state.read && date === today);
      button.classList.toggle("is-openable", state.unlocked && !state.read);
      button.classList.toggle("is-read", state.read);
      button.querySelector(".door-state").textContent = state.label;
      var name = formatWhen(date);
      var theme = date === MAGIC_DAY ? ", Harry Potter Christmas" : "";
      var detail = state.unlocked
        ? state.ready
          ? " Open the recipe."
          : " The recipe is on its way."
        : " Opens at 8:00.";
      button.setAttribute("aria-label", name + theme + ". " + state.label + "." + detail);
    });
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.hidden = true;
    }, 3400);
  }

  function svgEl(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
  }

  function glassesIcon() {
    var svg = svgEl("svg");
    svg.setAttribute("viewBox", "0 0 72 30");
    svg.setAttribute("class", "glasses");
    svg.setAttribute("aria-hidden", "true");
    ["16", "56"].forEach(function (cx) {
      var lens = svgEl("circle");
      lens.setAttribute("cx", cx);
      lens.setAttribute("cy", "16");
      lens.setAttribute("r", "9");
      lens.setAttribute("fill", "none");
      lens.setAttribute("stroke", "currentColor");
      lens.setAttribute("stroke-width", "2.6");
      svg.appendChild(lens);
    });
    var bridge = svgEl("path");
    bridge.setAttribute("d", "M25 14 Q36 7 47 14");
    bridge.setAttribute("fill", "none");
    bridge.setAttribute("stroke", "currentColor");
    bridge.setAttribute("stroke-width", "2.4");
    bridge.setAttribute("stroke-linecap", "round");
    svg.appendChild(bridge);
    return svg;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function asList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (item) {
        return String(item).trim();
      })
      .filter(Boolean);
  }

  function safeImage(src) {
    if (typeof src !== "string") return "";
    var trimmed = src.trim();
    if (/^https:\/\/\S+$/i.test(trimmed)) return trimmed;
    if (/^(?:\.\/|\/)?[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(trimmed)) return trimmed;
    return "";
  }

  function fillDialog(date) {
    var magic = date === MAGIC_DAY;
    var recipe = recipeFor(date);
    dialog.classList.toggle("sheet--magic", magic);
    document.body.classList.toggle("is-magic", magic);
    dialog.replaceChildren();

    var card = el("article", magic ? "card card--magic" : "card");
    var top = el("div", "card-top");
    top.appendChild(el("p", "kicker", formatWhen(date)));
    var close = el("button", "close", "Close");
    close.type = "button";
    close.addEventListener("click", function () {
      dialog.close();
    });
    top.appendChild(close);
    card.appendChild(top);

    if (magic) {
      var candles = el("div", "candles");
      candles.setAttribute("aria-hidden", "true");
      for (var i = 0; i < 5; i += 1) candles.appendChild(document.createElement("i"));
      card.appendChild(candles);
      card.appendChild(el("p", "magic-kicker", "A Harry Potter Christmas"));
    }

    var title = el("h2", "recipe-title");
    title.id = "recipe-title";
    card.appendChild(title);

    if (!recipe) {
      title.textContent = magic ? "The feast is still in the kitchen" : "Still on the stove";
      card.appendChild(
        el(
          "p",
          "pending",
          magic
            ? "The candles are already lit. The recipe will be set down here as soon as it’s ready."
            : "This door is open. The meal is still being written down, and it will be here as soon as it’s ready."
        )
      );
      dialog.appendChild(card);
      return;
    }

    title.textContent = recipe.title.trim();

    var imageSrc = safeImage(recipe.image);
    if (imageSrc) {
      var image = el("img", "recipe-photo");
      image.src = imageSrc;
      image.alt = typeof recipe.imageAlt === "string" && recipe.imageAlt.trim() ? recipe.imageAlt.trim() : recipe.title.trim();
      image.addEventListener("error", function () {
        image.remove();
      });
      card.appendChild(image);
    }

    if (typeof recipe.note === "string" && recipe.note.trim()) {
      card.appendChild(el("p", "note", recipe.note.trim()));
    }

    var serves = typeof recipe.serves === "string" ? recipe.serves.trim() : "";
    var time = typeof recipe.time === "string" ? recipe.time.trim() : "";
    if (serves || time) {
      var meta = el("p", "meta");
      if (serves) meta.appendChild(el("span", "pill", "Serves " + serves));
      if (time) meta.appendChild(el("span", "pill", time));
      card.appendChild(meta);
    }

    var ingredients = asList(recipe.ingredients);
    if (ingredients.length) {
      card.appendChild(el("h3", "section-label", "Ingredients"));
      var list = el("ul", "ingredients");
      ingredients.forEach(function (item) {
        var li = el("li");
        li.appendChild(el("span", magic ? "marker marker--star" : "marker", magic ? "✦" : ""));
        li.appendChild(el("span", "", item));
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    var steps = asList(recipe.steps);
    if (steps.length) {
      card.appendChild(el("h3", "section-label", "Method"));
      var stepsList = el("ol", "steps");
      steps.forEach(function (step, index) {
        var li = el("li");
        li.appendChild(el("span", "num", String(index + 1)));
        li.appendChild(el("span", "", step));
        stepsList.appendChild(li);
      });
      card.appendChild(stepsList);
    }

    if (magic) {
      card.appendChild(el("p", "magic-close", "The longest table is set. Eat while the candles last."));
    }

    dialog.appendChild(card);
  }

  function openDoor(date, button) {
    var now = getNow();
    var state = doorState(date, now, readOpened());
    if (!state.unlocked) {
      button.classList.remove("is-shaking");
      void button.offsetWidth;
      button.classList.add("is-shaking");
      var when = formatWhen(date);
      showToast(
        date === localISO(now)
          ? "Today’s meal is set out at 8:00."
          : "This door opens on " + when + " at 8:00."
      );
      return;
    }
    if (state.ready) markOpened(date);
    fillDialog(date);
    paint();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function buildDoors() {
    dates.forEach(function (date) {
      var item = el("li");
      var button = el("button", "door");
      button.type = "button";
      button.dataset.date = date;
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", "recipe");
      if (date === MAGIC_DAY) button.classList.add("door--magic");

      var panel = el("span", "door-panel");
      var dayNum = el("span", "door-day", String(Number(date.slice(-2))));
      var hiddenMonth = el("span", "visually-hidden", " December");
      panel.appendChild(dayNum);
      panel.appendChild(hiddenMonth);

      if (date === MAGIC_DAY) {
        panel.appendChild(glassesIcon());
        var theme = el("span", "door-theme", "Harry Potter");
        theme.setAttribute("aria-hidden", "true");
        panel.appendChild(theme);
        /* Harry P draws the book-cover letters from these characters. See fonts/harryp-readme.txt. */
        if (document.fonts && document.fonts.load) {
          document.fonts.load('16px "Harry P"').then(function (loaded) {
            if (loaded && loaded.length) theme.textContent = "Har\u00A1y Pot\u00A4e\u00A5";
          });
        }
      }

      panel.appendChild(el("span", "door-state", ""));
      button.appendChild(panel);
      button.addEventListener("click", function () {
        openDoor(date, button);
      });
      button.addEventListener("animationend", function () {
        button.classList.remove("is-shaking");
      });
      item.appendChild(button);
      doorsRoot.appendChild(item);
      buttons.set(date, button);
    });
  }

  var waiting = document.getElementById("waiting");
  var waitTab = document.getElementById("wait-tab");
  var waitingDismissed = false;
  var waitingReached = false;
  var waitingStart = window.scrollY;

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("is-magic");
  });

  if (waiting) {
    waiting.addEventListener("click", function (event) {
      if (event.target === waiting) waiting.close();
    });
    waiting.addEventListener("close", function () {
      waitingDismissed = true;
    });
    var waitingClose = document.getElementById("waiting-close");
    if (waitingClose) {
      waitingClose.addEventListener("click", function () {
        waiting.close();
      });
    }
  }

  if (waitTab) {
    waitTab.addEventListener("click", function () {
      if (!waiting || typeof waiting.showModal !== "function") return;
      if (!stillWaitingFor(getNow())) return;
      if (!waiting.open) waiting.showModal();
    });
  }

  function stillWaitingFor(now) {
    return now.getTime() < zonedDateTime(dates[0], UNLOCK_HOUR).getTime();
  }

  function reachedMiddle() {
    var scrolling = document.scrollingElement || document.documentElement;
    var maxScroll = scrolling.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return false;
    return scrolling.scrollTop >= maxScroll * 0.5;
  }

  function syncWaiting(now) {
    var still = stillWaitingFor(now);
    if (waitTab) waitTab.hidden = !still;
    if (!waiting) return;
    if (!still && waiting.open) waiting.close();
  }

  function onWaitingScroll() {
    if (!waiting || waitingDismissed || waitingReached) return;
    if (typeof waiting.showModal !== "function") return;
    if (!stillWaitingFor(getNow())) return;
    var scrolling = document.scrollingElement || document.documentElement;
    if (Math.abs(scrolling.scrollTop - waitingStart) < 12) return;
    if (!reachedMiddle()) return;
    try {
      waiting.showModal();
      waitingReached = true;
    } catch (err) {}
  }

  window.addEventListener("scroll", onWaitingScroll, { passive: true });

  var loader = document.getElementById("loader");
  var loaderCount = document.getElementById("loader-count");
  var loaderWhen = document.getElementById("loader-when");
  var loaderGone = !loader || loader.hidden || document.documentElement.classList.contains("advent-open");

  function endLoader() {
    if (loaderGone) return;
    loaderGone = true;
    if (window.leaveLoader) window.leaveLoader();
    else if (loader) loader.hidden = true;
  }

  function paintLoader(now) {
    if (loaderGone || !loader || loader.hidden) return;
    var firstUnlock = zonedDateTime(dates[0], UNLOCK_HOUR);
    if (now.getTime() >= firstUnlock.getTime()) {
      endLoader();
      return;
    }
    if (loaderWhen) loaderWhen.textContent = formatWhen(dates[0]) + " at 8:00";
    if (loaderCount) loaderCount.textContent = formatDistance(firstUnlock.getTime() - now.getTime());
  }

  if (!loaderGone) startCatch();

  function startCatch() {
    var field = document.getElementById("catch-field");
    var cat = document.getElementById("catch-cat");
    var scoreEl = document.getElementById("catch-now");
    var bestEl = document.getElementById("catch-best");
    if (!field || !cat || !loader) return;
    var score = 0;
    var best = 0;
    try { best = Number(sessionStorage.getItem("sunny-catch-best")) || 0; } catch (err) {}
    if (bestEl) bestEl.textContent = String(best);
    var balls = [];
    var last = 0;
    var spawnIn = 500;
    var running = true;

    function showScore() {
      if (scoreEl) scoreEl.textContent = String(score);
      if (bestEl) bestEl.textContent = String(best);
    }

    function slideCat(clientX) {
      var rect = field.getBoundingClientRect();
      var local = clientX - rect.left;
      var half = cat.offsetWidth / 2;
      var next = Math.max(half, Math.min(rect.width - half, local));
      cat.style.left = next + "px";
    }

    function miss() {
      score = 0;
      showScore();
    }

    function burst(el) {
      var fieldRect = field.getBoundingClientRect();
      var rect = el.getBoundingClientRect();
      var cx = rect.left + rect.width / 2 - fieldRect.left;
      var cy = rect.top + rect.height / 2 - fieldRect.top;
      var gold = el.classList.contains("bauble--gold");
      for (var i = 0; i < 7; i++) {
        var bit = document.createElement("span");
        bit.className = "bauble-bit" + (gold ? " bauble-bit--gold" : "");
        bit.setAttribute("aria-hidden", "true");
        bit.style.left = cx + "px";
        bit.style.top = cy + "px";
        var angle = (Math.PI * 2 * i) / 7 + Math.random() * 0.4;
        var dist = 28 + Math.random() * 22;
        bit.style.setProperty("--dx", (Math.cos(angle) * dist) + "px");
        bit.style.setProperty("--dy", (Math.sin(angle) * dist) + "px");
        field.appendChild(bit);
        window.setTimeout(function (node) { node.remove(); }, 360, bit);
      }
    }

    function pop(ball) {
      if (!ball.el || ball.popping) return;
      ball.popping = true;
      score += 1;
      if (score > best) {
        best = score;
        try { sessionStorage.setItem("sunny-catch-best", String(best)); } catch (err) {}
      }
      showScore();
      cat.classList.remove("is-swat");
      void cat.offsetWidth;
      cat.classList.add("is-swat");
      var el = ball.el;
      el.classList.add("is-pop");
      el.disabled = true;
      burst(el);
      window.setTimeout(function () {
        if (el.parentNode) el.remove();
        ball.el = null;
      }, 280);
    }

    var bugs = [];
    var bugIn = 1600;

    function pace() {
      return {
        bubbleVy: Math.min(380, 100 + score * 18),
        bugVy: Math.min(320, 78 + score * 16),
        drift: Math.min(110, 12 + score * 9),
        bubbleGap: Math.max(240, 980 - score * 55),
        bugGap: Math.max(620, 3400 - score * 240),
        maxBubbles: Math.min(6, 3 + Math.floor(score / 3)),
        maxBugs: score >= 6 ? 2 : 1
      };
    }

    function overlaps(el, inset) {
      if (!el) return false;
      var catRect = cat.getBoundingClientRect();
      var rect = el.getBoundingClientRect();
      var bx = rect.left + rect.width / 2;
      var by = rect.top + rect.height / 2;
      var shrink = catRect.width * inset;
      return bx >= catRect.left + shrink && bx <= catRect.right - shrink
        && by >= catRect.top + 10 && by <= catRect.bottom - 8;
    }

    function openX(width) {
      var room = Math.max(20, field.clientWidth - width - 8);
      var x = 8 + Math.random() * room;
      for (var tries = 0; tries < 6; tries++) {
        var guess = 8 + Math.random() * room;
        var crowded = false;
        balls.forEach(function (ball) {
          if (ball.el && ball.y < 90 && Math.abs(ball.x - guess) < 62) crowded = true;
        });
        bugs.forEach(function (bug) {
          if (bug.el && bug.y < 90 && Math.abs(bug.x - guess) < 62) crowded = true;
        });
        if (!crowded) return guess;
        x = guess;
      }
      return x;
    }

    function puff(el) {
      var fieldRect = field.getBoundingClientRect();
      var rect = el.getBoundingClientRect();
      var cx = rect.left + rect.width / 2 - fieldRect.left;
      var cy = rect.top + rect.height / 2 - fieldRect.top;
      for (var i = 0; i < 6; i++) {
        var bit = document.createElement("span");
        bit.className = "stink-bit";
        bit.setAttribute("aria-hidden", "true");
        bit.style.left = cx + "px";
        bit.style.top = cy + "px";
        var angle = (Math.PI * 2 * i) / 6;
        var dist = 22 + Math.random() * 18;
        bit.style.setProperty("--dx", (Math.cos(angle) * dist) + "px");
        bit.style.setProperty("--dy", (Math.sin(angle) * dist - 10) + "px");
        field.appendChild(bit);
        window.setTimeout(function (node) { node.remove(); }, 420, bit);
      }
    }

    function sting(bug) {
      if (!bug.el || bug.gone) return;
      bug.gone = true;
      miss();
      var bugRect = bug.el.getBoundingClientRect();
      var catRect = cat.getBoundingClientRect();
      var center = catRect.left + catRect.width / 2;
      var dir = (bugRect.left + bugRect.width / 2) < center ? 1 : -1;
      slideCat(center + dir * 130);
      cat.classList.remove("is-reek");
      void cat.offsetWidth;
      cat.classList.add("is-reek");
      var el = bug.el;
      el.classList.add("is-stink");
      el.disabled = true;
      puff(el);
      window.setTimeout(function () {
        if (el.parentNode) el.remove();
        bug.el = null;
        cat.classList.remove("is-reek");
      }, 340);
    }

    function spawn() {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bauble" + (Math.random() > 0.45 ? " bauble--gold" : "");
      btn.setAttribute("aria-label", "Catch bubble");
      var x = openX(52);
      btn.style.left = x + "px";
      btn.style.top = "-56px";
      var ball = { el: btn, x: x, y: -56, vy: pace().bubbleVy };
      btn.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        slideCat(event.clientX);
      });
      field.appendChild(btn);
      balls.push(ball);
    }

    function spawnBug() {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stinkbug";
      btn.setAttribute("aria-label", "Stink bug. Avoid.");
      btn.innerHTML = '<svg viewBox="0 0 68 52" aria-hidden="true">'
        + '<path d="M30 16C22 6 24 1 30 0M38 16C46 6 44 1 38 0" fill="none" stroke="#2c2416" stroke-width="1.6" stroke-linecap="round"/>'
        + '<path d="M18 26c-12 1-16 8-12 13M16 32c-14 4-14 12-6 14M50 26c12 1 16 8 12 13M52 32c14 4 14 12 6 14M24 38c-10 6-9 13-2 15M44 38c10 6 9 13 2 15" fill="none" stroke="#3a2e16" stroke-width="1.8" stroke-linecap="round"/>'
        + '<path d="M34 12c12 0 20 7 22 16 2 11-5 18-14 20-7 1-16 1-22 0C10 46 4 38 6 28 8 18 20 12 34 12z" fill="#6d7c32"/>'
        + '<path d="M34 18c8 1 14 5 16 11-10 2-22 2-32 0 2-7 8-12 16-11z" fill="#96a448"/>'
        + '<path d="M34 18l10 10-10 16-10-10z" fill="#556428"/>'
        + '<path d="M16 30h36" fill="none" stroke="#3f4a1c" stroke-width="1.2" opacity="0.7"/>'
        + '<circle cx="24" cy="31" r="1.5" fill="#31400f"/><circle cx="44" cy="30" r="1.4" fill="#31400f"/>'
        + '<circle cx="28" cy="37" r="1.3" fill="#31400f"/><circle cx="41" cy="36" r="1.2" fill="#31400f"/>'
        + '<ellipse cx="34" cy="16" rx="6.2" ry="4" fill="#5c692c"/>'
        + '<circle cx="31.2" cy="15.4" r="1" fill="#16110c"/><circle cx="36.8" cy="15.4" r="1" fill="#16110c"/>'
        + '</svg>';
      var x = openX(58);
      btn.style.left = x + "px";
      btn.style.top = "-52px";
      var bug = {
        el: btn,
        x: x,
        y: -52,
        vy: pace().bugVy,
        vx: (Math.random() < 0.5 ? -1 : 1) * pace().drift
      };
      btn.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
      });
      field.appendChild(btn);
      bugs.push(bug);
    }

    field.addEventListener("pointerdown", function (event) {
      if (event.target.closest && (event.target.closest(".bauble") || event.target.closest(".stinkbug"))) return;
      slideCat(event.clientX);
    });

    function frame(now) {
      if (!running || loader.hidden) return;
      var dt = last ? Math.min(0.034, (now - last) / 1000) : 0;
      last = now;
      var step = pace();
      spawnIn -= dt * 1000;
      bugIn -= dt * 1000;
      var alive = 0;
      balls.forEach(function (ball) { if (ball.el) alive += 1; });
      if (spawnIn <= 0 && alive < step.maxBubbles) {
        spawn();
        spawnIn = step.bubbleGap;
      }
      var bugsAlive = 0;
      bugs.forEach(function (bug) { if (bug.el) bugsAlive += 1; });
      if (bugIn <= 0 && bugsAlive < step.maxBugs) {
        spawnBug();
        bugIn = step.bugGap;
      }
      var floor = field.clientHeight - 28;
      var stung = false;
      var maxX = Math.max(8, field.clientWidth - 62);
      bugs.forEach(function (bug) {
        if (!bug.el || bug.gone) return;
        bug.vy = step.bugVy;
        bug.vx = (bug.vx < 0 ? -1 : 1) * step.drift;
        bug.y += bug.vy * dt;
        bug.x += bug.vx * dt;
        if (bug.x < 6) { bug.x = 6; bug.vx = Math.abs(bug.vx); }
        if (bug.x > maxX) { bug.x = maxX; bug.vx = -Math.abs(bug.vx); }
        bug.el.style.top = bug.y + "px";
        bug.el.style.left = bug.x + "px";
        if (overlaps(bug.el, 0.2)) {
          sting(bug);
          stung = true;
          return;
        }
        if (bug.y >= floor) {
          bug.el.remove();
          bug.el = null;
        }
      });
      balls.forEach(function (ball) {
        if (!ball.el || ball.popping) return;
        ball.vy = step.bubbleVy;
        ball.y += ball.vy * dt;
        ball.el.style.top = ball.y + "px";
        if (!stung && overlaps(ball.el, 0.06)) {
          pop(ball);
          return;
        }
        if (ball.y >= floor) {
          ball.el.remove();
          ball.el = null;
          miss();
        }
      });
      balls = balls.filter(function (ball) { return ball.el; });
      bugs = bugs.filter(function (bug) { return bug.el; });
      window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  }

  buildDoors();
  paint();
  syncWaiting(getNow());
  paintLoader(getNow());
  window.setInterval(function () {
    var now = getNow();
    paint();
    syncWaiting(now);
    paintLoader(now);
  }, 1000);
})();
