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

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("is-magic");
  });

  buildDoors();
  paint();
  window.setInterval(paint, 1000);
})();
