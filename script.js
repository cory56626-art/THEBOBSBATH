(() => {
  "use strict";

  const records = [
    { game: "fnaf1", gameLabel: "FNAF 1", type: "Classic", slug: "freddy-fazbear", name: "Freddy Fazbear", species: "bear", color: "#9b6b3c", accent: "#f2b84b", description: "The lead singer of the original band. Freddy waits until the building is dark, then advances through the cameras with a slow, deliberate rhythm and a laugh that gives away very little.", facts: ["Stage leader", "Power-aware", "East hall"] },
    { game: "fnaf1", gameLabel: "FNAF 1", type: "Classic", slug: "bonnie", name: "Bonnie", species: "rabbit", color: "#5e5ca2", accent: "#f2b84b", description: "The purple guitarist is usually the first original animatronic to leave the stage. His route favors the left side of the office, where his silhouette can appear almost silently at the door.", facts: ["Guitarist", "Left door", "Fast route"] },
    { game: "fnaf1", gameLabel: "FNAF 1", type: "Classic", slug: "chica", name: "Chica", species: "chicken", color: "#b9a95e", accent: "#f2b84b", description: "Chica patrols the right side of the restaurant with her little cupcake close by. Kitchen camera audio is one of the few ways to know where she has gone.", facts: ["Right door", "Kitchen route", "Cupcake"] },
    { game: "fnaf1", gameLabel: "FNAF 1", type: "Classic", slug: "foxy", name: "Foxy", species: "fox", color: "#8b4d3c", accent: "#f2b84b", description: "Behind the curtain at Pirate Cove, Foxy becomes more active whenever he is ignored. Once he commits to a run, the office has only a moment to react.", facts: ["Pirate Cove", "Sprint attack", "Curtain"] },
    { game: "fnaf1", gameLabel: "FNAF 1", type: "Classic / Secret", slug: "golden-freddy", name: "Golden Freddy", species: "goldbear", color: "#b4914a", accent: "#f2b84b", description: "A rare, impossible apparition that can appear as a limp golden suit. Golden Freddy does not behave like the others, turning an ordinary camera check into a sudden hallucination.", facts: ["Rare event", "Hallucination", "Golden suit"] },

    { game: "fnaf2", gameLabel: "FNAF 2", type: "Toy", slug: "toy-freddy", name: "Toy Freddy", species: "bear", color: "#956441", accent: "#60cad0", description: "The polished replacement for Freddy carries the same stage-leader outline with a much brighter plastic finish. He eventually leaves the show stage and heads for the office.", facts: ["New model", "Facial scan", "Front stage"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Toy", slug: "toy-bonnie", name: "Toy Bonnie", species: "rabbit", color: "#4b93a2", accent: "#60cad0", description: "Toy Bonnie has a glossy blue shell, painted cheeks, and a habit of using the vents. The Freddy mask is the intended answer when he reaches the office.", facts: ["Blue shell", "Vent route", "Mask check"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Toy", slug: "toy-chica", name: "Toy Chica", species: "chicken", color: "#d3b55c", accent: "#60cad0", description: "Toy Chica leaves the stage with an unnervingly bright smile. Her missing beak is an unmistakable sign that she has moved close to the office.", facts: ["Stage model", "Missing beak", "Vent route"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Toy", slug: "mangle", name: "Mangle", species: "mangle", color: "#c56e83", accent: "#60cad0", description: "Originally a take-apart attraction, Mangle became a tangled mass of parts after being repeatedly dismantled. The ceiling is just as dangerous as the hallway.", facts: ["Take-apart", "Ceiling route", "Radio static"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Toy", slug: "balloon-boy", name: "Balloon Boy", species: "balloon", color: "#d17c6d", accent: "#60cad0", description: "Balloon Boy is less interested in a direct attack than in getting close enough to drain the office's flashlight supply. His laugh can be a warning or a distraction.", facts: ["Flashlight drain", "Laugh cue", "Vent route"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Puppet", slug: "the-puppet", name: "The Puppet", species: "puppet", color: "#d2d6da", accent: "#60cad0", description: "The Puppet is tied to the Prize Corner music box. If the winding stops, the long-faced figure leaves its box and ignores the usual rules of the building.", facts: ["Music box", "Prize Corner", "Unusual rules"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Withered", slug: "withered-bonnie", name: "Withered Bonnie", species: "witheredrabbit", color: "#4d4c73", accent: "#60cad0", description: "An older Bonnie shell with its face missing, exposing the mechanical structure underneath. Withered Bonnie enters from the office front and makes the mask reaction especially important.", facts: ["Missing face", "Old model", "Office front"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Withered", slug: "withered-chica", name: "Withered Chica", species: "witheredchicken", color: "#9b884d", accent: "#60cad0", description: "Withered Chica's jaw is permanently stuck open, and her endoskeleton shows through the damaged shell. The vents are her preferred route to the guard.", facts: ["Broken jaw", "Exposed frame", "Vent route"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Withered", slug: "withered-foxy", name: "Withered Foxy", species: "witheredfox", color: "#79463c", accent: "#60cad0", description: "The older Foxy is torn, sharp, and unusually resistant to the mask. Flashing the hallway light is the best way to keep his advance in check.", facts: ["Mask resistant", "Hallway light", "Damaged shell"] },
    { game: "fnaf2", gameLabel: "FNAF 2", type: "Withered", slug: "withered-freddy", name: "Withered Freddy", species: "witheredbear", color: "#765537", accent: "#60cad0", description: "Withered Freddy is the battered predecessor to the Toy models. His movement is less frantic than some of the others, but the crowded second office leaves no room for complacency.", facts: ["Old model", "Damaged shell", "Office front"] },

    { game: "fnaf3", gameLabel: "FNAF 3", type: "Springtrap", slug: "springtrap", name: "Springtrap", species: "springtrap", color: "#64764a", accent: "#a3c46c", description: "A decayed spring-lock suit containing the person behind the original disappearances. Springtrap is the sole physical hunter in the attraction, using the vents and sound lures to close the distance.", facts: ["Spring-lock suit", "Sound lures", "Physical threat"] },
    { game: "fnaf3", gameLabel: "FNAF 3", type: "Phantom", slug: "phantom-freddy", name: "Phantom Freddy", species: "phantom", color: "#5d684f", accent: "#a3c46c", description: "A scorched hallucination that appears through the attraction's failing systems. Phantom Freddy is not a normal roaming body, but his appearance can still break a careful night.", facts: ["Hallucination", "System error", "Scorched"] },
    { game: "fnaf3", gameLabel: "FNAF 3", type: "Phantom", slug: "phantom-chica", name: "Phantom Chica", species: "phantom", color: "#867f4f", accent: "#a3c46c", description: "Phantom Chica flickers into view through the arcade and camera network. Her image is brief, but the resulting disruption is enough to help Springtrap reposition.", facts: ["Arcade sighting", "Camera error", "Disruption"] },
    { game: "fnaf3", gameLabel: "FNAF 3", type: "Phantom", slug: "phantom-foxy", name: "Phantom Foxy", species: "phantom", color: "#57413c", accent: "#a3c46c", description: "Phantom Foxy can materialize in the office without following the normal map. His sudden appearance punishes a guard who forgets to look away from the monitor.", facts: ["Office sighting", "Monitor cue", "Disruption"] },
    { game: "fnaf3", gameLabel: "FNAF 3", type: "Phantom", slug: "phantom-mangle", name: "Phantom Mangle", species: "phantom", color: "#866070", accent: "#a3c46c", description: "A burned, ghostly echo of Mangle that can appear on the camera network. The static and audio distortion it creates make the attraction feel suddenly much smaller.", facts: ["Static", "Audio error", "Ceiling echo"] },
    { game: "fnaf3", gameLabel: "FNAF 3", type: "Phantom", slug: "phantom-puppet", name: "Phantom Puppet", species: "phantompuppet", color: "#59636a", accent: "#a3c46c", description: "The Phantom Puppet fills the screen with a long, burned face and leaves the systems unstable. Like the other phantoms, it is a warning that the attraction is falling apart.", facts: ["Screen fill", "System error", "Burned mask"] },
    { game: "fnaf3", gameLabel: "FNAF 3", type: "Phantom", slug: "phantom-bb", name: "Phantom Balloon Boy", species: "phantomballoon", color: "#786754", accent: "#a3c46c", description: "A damaged apparition of Balloon Boy that appears in the camera feed. The result is less a chase than a moment of blindness at exactly the wrong time.", facts: ["Camera feed", "Blindness", "Static"] },

    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "nightmare-freddy", name: "Nightmare Freddy", species: "nightmare", color: "#76543f", accent: "#c18cff", description: "The bedroom's Freddy is larger, darker, and lined with teeth. Tiny Freddles gather on the bed as a warning that the nightmare is getting closer.", facts: ["Bedroom", "Freddles", "Listen closely"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "nightmare-bonnie", name: "Nightmare Bonnie", species: "nightmare", color: "#5e4a76", accent: "#c18cff", description: "Nightmare Bonnie waits at the left door, where the game turns sound into the most important camera. A quiet hallway is never automatically a safe one.", facts: ["Left door", "Sound cue", "Teeth"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "nightmare-chica", name: "Nightmare Chica", species: "nightmare", color: "#8e7b43", accent: "#c18cff", description: "Nightmare Chica mirrors Bonnie on the right side of the room. Her cupcake becomes an active part of the threat, watching from a place that should feel harmless.", facts: ["Right door", "Cupcake", "Sound cue"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "nightmare-foxy", name: "Nightmare Foxy", species: "nightmarefox", color: "#74454a", accent: "#c18cff", description: "Nightmare Foxy starts in the closet and becomes more present when the room is neglected. His shifting silhouette turns checking the closet into a timed routine.", facts: ["Closet", "Timed check", "Fast shift"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "nightmare-fredbear", name: "Nightmare Fredbear", species: "nightmarebear", color: "#8f673c", accent: "#c18cff", description: "Fredbear takes over the nightmare late in the week, combining the door, bed, and closet into one relentless pattern. Every sound becomes evidence.", facts: ["Late-week threat", "Three zones", "Fredbear"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "nightmare", name: "Nightmare", species: "shadow", color: "#392f4b", accent: "#c18cff", description: "A nearly translucent shadow version of the nightmare, defined by a dark silhouette and a glowing presence. Nightmare is the final pressure test of the bedroom rules.", facts: ["Shadow form", "Final night", "Low visibility"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "plushtrap", name: "Plushtrap", species: "plush", color: "#8b7655", accent: "#c18cff", description: "A small spring-trap plush that appears in the hallway challenge. Its size is deceptive: the short encounter depends on timing, darkness, and a narrow beam of light.", facts: ["Hallway", "Minigame", "Timing"] },
    { game: "fnaf4", gameLabel: "FNAF 4", type: "Nightmare", slug: "jack-o-bonnie", name: "Jack-O-Bonnie", species: "nightmare", color: "#b66b3e", accent: "#c18cff", description: "A Halloween variant with a glowing orange interior, catalogued here as part of the nightmare family. His silhouette makes the familiar rabbit shape look furnace-hot.", facts: ["Halloween", "Glow", "Variant"] }
  ];

  const sectionInfo = {
    fnaf1: { label: "FNAF 1", numeral: "01", title: "The original", subtitle: "THE RESTAURANT", description: "The first night shift establishes the rules: conserve power, watch the halls, and never assume the stage is still full." },
    fnaf2: { label: "FNAF 2", numeral: "02", title: "The new face", subtitle: "THE REOPENING", description: "More cameras, more bodies, and no doors. The second location turns every second into a maintenance problem." },
    fnaf3: { label: "FNAF 3", numeral: "03", title: "The attraction", subtitle: "THE REMAINS", description: "A horror attraction built from old rumors brings the past back into one building, along with systems that can fail at any moment." },
    fnaf4: { label: "FNAF 4", numeral: "04", title: "The bedroom", subtitle: "THE NIGHTMARE", description: "The map disappears. The cameras disappear. What remains is a bedroom, two doors, and the sound of something breathing." }
  };

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const landing = $("#landing");
  const noseButton = $("#freddyNose");
  const jumpscare = $("#jumpscare");
  const main = $("#mainContent");
  const archiveSections = $("#archiveSections");
  const searchInput = $("#characterSearch");
  const searchResults = $("#searchResults");
  const resultCount = $("#resultCount");
  const ambienceToggle = $("#ambienceToggle");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeFilter = "all";
  let introFinished = false;
  let ambienceOn = true;
  let audioContext = null;
  let ambienceNodes = [];
  let ambienceTimer = null;
  let currentAmbientGame = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function createPortrait(record) {
    const id = record.slug.replace(/[^a-z0-9]/gi, "");
    const c = record.color;
    const isFox = record.species.includes("fox");
    const isRabbit = record.species.includes("rabbit") || record.species === "nightmare";
    const isChicken = record.species.includes("chicken");
    const isPuppet = record.species.includes("puppet");
    const isBalloon = record.species.includes("balloon");
    const isNightmare = record.species.includes("nightmare") || record.species === "nightmarebear" || record.species === "shadow";
    const isPhantom = record.species.includes("phantom");
    const earShape = isPuppet || isBalloon ? "" : isFox ? `<path d="M56 123L28 62Q25 50 39 58L85 95Z" fill="${c}" stroke="#161116" stroke-width="7"/><path d="M244 123l28-61q3-12-11-4l-46 37Z" fill="${c}" stroke="#161116" stroke-width="7"/>` : `<path d="M65 102L48 34Q48 20 62 29l47 55Z" fill="${c}" stroke="#161116" stroke-width="7"/><path d="M235 102l17-68q0-14-14-5l-47 55Z" fill="${c}" stroke="#161116" stroke-width="7"/>`;
    const eyeColor = isPhantom ? "#d3ffb4" : isNightmare ? "#ffd65a" : "#e9dfaf";
    const eyeSize = isNightmare ? 18 : 13;
    const facePath = isPuppet ? `<path d="M88 89Q150 63 212 89l-12 146q-50 40-100 0Z" fill="${c}" stroke="#161116" stroke-width="7"/>` : isBalloon ? `<path d="M80 93Q150 62 220 93l-10 119q-60 38-120 0Z" fill="${c}" stroke="#161116" stroke-width="7"/>` : `<path d="M68 108Q150 66 232 108l-9 110q-73 64-146 0Z" fill="url(#face-${id})" stroke="#161116" stroke-width="7"/>`;
    const muzzle = isPuppet ? `<path d="M114 181h72l-9 58q-27 17-54 0Z" fill="#1b1720" opacity=".82"/>` : isBalloon ? `<ellipse cx="150" cy="169" rx="37" ry="28" fill="#e9b6a2" opacity=".72"/>` : `<ellipse cx="150" cy="173" rx="47" ry="34" fill="${isNightmare ? "#795333" : "#a3784e"}" opacity=".74"/>`;
    const eyes = isPuppet ? `<ellipse cx="119" cy="142" rx="10" ry="15" fill="#141017"/><ellipse cx="181" cy="142" rx="10" ry="15" fill="#141017"/><circle cx="119" cy="144" r="4" fill="${eyeColor}"/><circle cx="181" cy="144" r="4" fill="${eyeColor}"/>` : `<circle cx="111" cy="145" r="${eyeSize}" fill="#111016" stroke="${eyeColor}" stroke-width="${isNightmare ? 7 : 4}"/><circle cx="189" cy="145" r="${eyeSize}" fill="#111016" stroke="${eyeColor}" stroke-width="${isNightmare ? 7 : 4}"/><circle cx="113" cy="145" r="4" fill="#fff9ce"/><circle cx="187" cy="145" r="4" fill="#fff9ce"/>`;
    const mouth = isPuppet ? `<path d="M116 216Q150 232 184 216" fill="none" stroke="#0c090e" stroke-width="8" stroke-linecap="round"/>` : `<path d="M105 214Q150 ${isNightmare ? 259 : 238} 195 214" fill="#171012" stroke="#161116" stroke-width="7"/><path d="M119 220l7 18 8-15 8 18 8-18 8 15 8-19" fill="none" stroke="#e9d8ad" stroke-width="6" stroke-linecap="round"/>`;
    const hat = record.species === "bear" || record.species === "goldbear" || record.species.includes("witheredbear") ? `<path d="M92 91V63h116v28M78 63h144" fill="#171217" stroke="#0c0a0d" stroke-width="7"/><path d="M88 79h124" stroke="${record.accent}" stroke-width="5" opacity=".65"/>` : "";
    const extras = isBalloon ? `<path d="M80 91Q54 42 78 25Q103 9 119 39Q150 8 181 39Q198 9 222 25Q246 42 220 91" fill="none" stroke="#171217" stroke-width="7"/><circle cx="78" cy="28" r="15" fill="#e3a7ae"/><circle cx="150" cy="25" r="15" fill="#89c7d5"/><circle cx="222" cy="28" r="15" fill="#e0c66a"/>` : isPuppet ? `<path d="M104 104L82 52M196 104l22-52" stroke="#171217" stroke-width="7"/><path d="M96 249l-13 31m40-25l-4 38m48-38l4 38m26-44l13 31" stroke="#171217" stroke-width="8" stroke-linecap="round"/>` : isFox ? `<path d="M215 176l41 15-26 17" fill="${c}" stroke="#161116" stroke-width="7"/><path d="M91 237l-17 28m40-22l-3 31m57-31l4 31m28-37l17 28" stroke="#161116" stroke-width="8" stroke-linecap="round"/>` : `<path d="M93 238l-10 30m47-26l-2 33m42-33l2 33m39-37l10 30" stroke="#161116" stroke-width="8" stroke-linecap="round"/>`;
    const crack = isPhantom || record.species.includes("withered") || record.species === "springtrap" ? `<path d="M89 123l24 18-16 20 26 14-17 23M209 114l-21 27 18 20-29 23" fill="none" stroke="#162018" stroke-width="6" stroke-linecap="round"/>` : "";
    const transparency = isPhantom ? `.32` : `1`;
    return `<svg viewBox="0 0 300 300" role="img" aria-label="Stylized vector portrait of ${escapeHtml(record.name)}" style="--portrait-opacity:${transparency}"><defs><linearGradient id="face-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset=".58" stop-color="${c}"/><stop offset="1" stop-color="#171116"/></linearGradient></defs><g opacity="var(--portrait-opacity)">${earShape}${extras}${facePath}${hat}${eyes}${muzzle}<circle cx="150" cy="176" r="10" fill="#201517"/>${mouth}${crack}${record.species === "springtrap" ? `<path d="M113 99l17-28m52 25l-15-30M95 159l-29 23m142-22l27 17" stroke="#bbcf87" stroke-width="4" opacity=".6"/>` : ""}</g></svg>`;
  }

  function renderArchive() {
    const groups = ["fnaf1", "fnaf2", "fnaf3", "fnaf4"];
    archiveSections.innerHTML = groups.map((game) => {
      const info = sectionInfo[game];
      return `<section class="game-section" id="${game}" data-game="${game}" data-label="${info.numeral}" aria-labelledby="heading-${game}"><div class="section-header"><div><p class="section-number">CASE FILE ${info.numeral} / ${info.label}</p><h3 id="heading-${game}">${info.title}<br /><span>${info.subtitle}</span></h3></div><p class="section-description">${info.description}</p></div><div class="character-list">${records.filter((record) => record.game === game).map((record, index) => `<article class="character-card" id="${record.slug}" data-game="${record.game}" data-type="${record.type.toLowerCase()}" data-name="${record.name.toLowerCase()}" data-tags="${record.name.toLowerCase()} ${record.type.toLowerCase()} ${record.species}"><div class="card-copy"><p class="card-index">${info.label} / ${String(index + 1).padStart(2, "0")} — RECORD</p><h4>${escapeHtml(record.name)}</h4><p class="card-type">${escapeHtml(record.type)} / ${info.label}</p><p class="card-description">${escapeHtml(record.description)}</p><div class="card-facts">${record.facts.map((fact) => `<span class="fact">${escapeHtml(fact)}</span>`).join("")}</div></div><div class="card-art"><div class="portrait-frame">${createPortrait(record)}<span class="portrait-label">${record.gameLabel}</span></div></div></article>`).join("")}</div></section>`;
    }).join("");
    resultCount.textContent = `${records.length} records`;
  }

  function setupCardObserver() {
    const cards = $$(".character-card");
    if (!("IntersectionObserver" in window) || reduceMotion) {
      cards.forEach((card) => card.classList.add("is-visible"));
      return;
    }
    const cardObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    cards.forEach((card) => cardObserver.observe(card));
  }

  function setupSectionObserver() {
    const sections = $$(".game-section");
    if (!("IntersectionObserver" in window)) return;
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          document.body.dataset.game = entry.target.dataset.game;
          updateAmbient(entry.target.dataset.game);
        }
      });
    }, { rootMargin: "-42% 0px -42% 0px", threshold: 0 });
    sections.forEach((section) => sectionObserver.observe(section));
  }

  function matchesFilter(record, filter) {
    if (filter === "all") return true;
    if (["fnaf1", "fnaf2", "fnaf3", "fnaf4"].includes(filter)) return record.game === filter;
    return record.type.toLowerCase().includes(filter);
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const cards = $$(".character-card");
    let visible = 0;
    cards.forEach((card) => {
      const recordMatches = matchesFilter({ game: card.dataset.game, type: card.dataset.type }, activeFilter);
      const searchMatches = !query || card.dataset.tags.includes(query);
      const show = recordMatches && searchMatches;
      card.classList.toggle("is-hidden", !show);
      if (show) visible += 1;
    });
    resultCount.textContent = `${visible} ${visible === 1 ? "record" : "records"}`;
    $$(".game-section").forEach((section) => {
      const hasVisible = section.querySelector(".character-card:not(.is-hidden)");
      section.classList.toggle("section-empty", !hasVisible);
    });
    showSearchResults(query);
  }

  function showSearchResults(query) {
    if (!query) {
      searchResults.classList.remove("is-open");
      searchResults.innerHTML = "";
      return;
    }
    const matches = records.filter((record) => `${record.name} ${record.type} ${record.gameLabel}`.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) {
      searchResults.innerHTML = `<div class="search-result"><span>No record found</span><small>try again</small></div>`;
      searchResults.classList.add("is-open");
      return;
    }
    searchResults.innerHTML = matches.map((record) => `<button class="search-result" type="button" data-target="${record.slug}"><span>${escapeHtml(record.name)}</span><small>${record.gameLabel}</small></button>`).join("");
    searchResults.classList.add("is-open");
  }

  function chooseFilter(button) {
    activeFilter = button.dataset.filter;
    $$(".filter-button").forEach((item) => item.classList.toggle("is-active", item === button));
    applyFilters();
  }

  function makeMusicNotes() {
    if (reduceMotion) return;
    const rect = searchInput.getBoundingClientRect();
    ["♪", "♫", "♩"].forEach((symbol, index) => {
      const note = document.createElement("span");
      note.className = "music-note";
      note.textContent = symbol;
      note.style.left = `${rect.left + rect.width * (.3 + index * .2)}px`;
      note.style.top = `${rect.top + 8}px`;
      note.style.setProperty("--x", `${(index - 1) * 24}px`);
      note.style.setProperty("--r", `${(index - 1) * 22}deg`);
      document.body.appendChild(note);
      window.setTimeout(() => note.remove(), 950);
    });
  }

  function getAudioContext() {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function playScareSound() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(.0001, now);
    master.gain.exponentialRampToValueAtTime(.42, now + .015);
    master.gain.exponentialRampToValueAtTime(.0001, now + 1.05);
    master.connect(ctx.destination);
    const oscillator = ctx.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(68, now);
    oscillator.frequency.exponentialRampToValueAtTime(920, now + .16);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 1.02);
    oscillator.connect(master);
    oscillator.start(now);
    oscillator.stop(now + 1.08);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.02, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = .8;
    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(master);
    noise.start(now);
    noise.stop(now + 1.03);
  }

  function stopAmbient() {
    if (ambienceTimer) window.clearInterval(ambienceTimer);
    ambienceTimer = null;
    ambienceNodes.forEach((node) => {
      try { node.stop(); } catch (_) { /* already stopped */ }
      try { node.disconnect(); } catch (_) { /* already disconnected */ }
    });
    ambienceNodes = [];
    currentAmbientGame = null;
  }

  function updateAmbient(game) {
    if (!ambienceOn || currentAmbientGame === game) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    stopAmbient();
    currentAmbientGame = game;
    const config = {
      fnaf1: { base: 58, pulse: 116, type: "sine", volume: .025 },
      fnaf2: { base: 76, pulse: 152, type: "triangle", volume: .022 },
      fnaf3: { base: 48, pulse: 96, type: "sawtooth", volume: .017 },
      fnaf4: { base: 34, pulse: 68, type: "sine", volume: .032 }
    }[game] || { base: 50, pulse: 100, type: "sine", volume: .02 };
    const now = ctx.currentTime;
    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.type = config.type;
    hum.frequency.value = config.base;
    humGain.gain.value = config.volume;
    hum.connect(humGain).connect(ctx.destination);
    hum.start(now);
    ambienceNodes.push(hum);
    const pulse = () => {
      if (!ambienceOn || !audioContext) return;
      const t = audioContext.currentTime;
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(config.pulse, t);
      o.frequency.exponentialRampToValueAtTime(config.base, t + .46);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(config.volume * .9, t + .04);
      g.gain.exponentialRampToValueAtTime(.0001, t + .52);
      o.connect(g).connect(audioContext.destination);
      o.start(t);
      o.stop(t + .56);
    };
    ambienceTimer = window.setInterval(pulse, game === "fnaf4" ? 2900 : 4100);
    pulse();
  }

  function toggleAmbience() {
    ambienceOn = !ambienceOn;
    ambienceToggle.setAttribute("aria-pressed", String(ambienceOn));
    $(".ambience-label", ambienceToggle).textContent = ambienceOn ? "Ambience on" : "Ambience off";
    if (ambienceOn) updateAmbient(document.body.dataset.game || "fnaf1");
    else stopAmbient();
  }

  function openRecord(slug) {
    const target = document.getElementById(slug);
    if (!target) return;
    searchResults.classList.remove("is-open");
    searchInput.value = "";
    activeFilter = "all";
    $$(".filter-button").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === "all"));
    applyFilters();
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.classList.add("record-focus");
    window.setTimeout(() => target.classList.remove("record-focus"), 1400);
  }

  function revealArchive() {
    if (introFinished) return;
    introFinished = true;
    landing.setAttribute("aria-hidden", "true");
    jumpscare.setAttribute("aria-hidden", "false");
    jumpscare.classList.add("is-active");
    document.body.classList.remove("intro-active");
    playScareSound();
    window.setTimeout(() => {
      document.body.classList.add("archive-open");
      main.setAttribute("aria-hidden", "false");
      jumpscare.classList.remove("is-active");
      document.body.dataset.game = "fnaf1";
      window.scrollTo({ top: 0, behavior: "auto" });
      updateAmbient("fnaf1");
      setupCardObserver();
      setupSectionObserver();
    }, reduceMotion ? 180 : 1100);
  }

  renderArchive();
  noseButton.addEventListener("click", revealArchive);
  ambienceToggle.addEventListener("click", toggleAmbience);
  $$(".filter-button").forEach((button) => button.addEventListener("click", () => chooseFilter(button)));
  searchInput.addEventListener("input", () => { makeMusicNotes(); applyFilters(); });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { searchInput.value = ""; applyFilters(); searchInput.blur(); }
    if (event.key === "Enter") {
      const first = $(".search-result[data-target]");
      if (first) openRecord(first.dataset.target);
    }
  });
  searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-target]");
    if (button) openRecord(button.dataset.target);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== searchInput) { event.preventDefault(); searchInput.focus(); }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap") && !event.target.closest(".search-results")) searchResults.classList.remove("is-open");
  });
})();
