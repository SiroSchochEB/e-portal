let currentState = {
  champions: [],
  rolls: {},
  selections: [],
  itemVotes: [],
  resetVotes: []
};

let selectedRole = "";
let lastRenderedSignature = "";

const ITEM_VOTES_PER_PLAYER = 3;

function readSeenRerollEvents(storageKey) {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(storageKey) || "[]"));
  } catch {
    return new Set();
  }
}

const seenItemRerollEvents = readSeenRerollEvents("braverySeenItemRerolls");
const seenPlayerRerollEvents = readSeenRerollEvents("braverySeenPlayerRerolls");

function persistSeenRerollEvents(storageKey, eventSet) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify([...eventSet].slice(-50)));
  } catch {
    // Session Storage ist optional. Die Logik funktioniert auch nur im Speicher.
  }
}

const roleLabels = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support"
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePlayerName(value) {
  return String(value || "").trim().toLowerCase();
}

function getPlayerName() {
  let playerName = localStorage.getItem("braveryPlayerName");

  if (!playerName) {
    playerName = prompt("Dein Name für diese Runde?") || "";
    playerName = playerName.trim();

    if (playerName) {
      localStorage.setItem("braveryPlayerName", playerName);
    }
  }

  return playerName;
}

function getCurrentPlayerSelection(selections) {
  const playerName = localStorage.getItem("braveryPlayerName");

  if (!playerName) return null;

  return (selections || []).find(
    selection => normalizePlayerName(selection.playerName) === normalizePlayerName(playerName)
  );
}

function getKnownPlayerKeys(state = currentState) {
  const keys = new Set();

  Object.keys(state.rolls || {}).forEach(key => {
    const normalized = normalizePlayerName(key);
    if (normalized) keys.add(normalized);
  });

  (state.selections || []).forEach(selection => {
    const normalized = normalizePlayerName(selection.playerName);
    if (normalized) keys.add(normalized);
  });

  return [...keys];
}

function getRequiredResetVotes(state = currentState) {
  return getKnownPlayerKeys(state).length >= 3 ? 2 : 1;
}

function getResetVoteCount(state = currentState) {
  return (state.resetVotes || []).length;
}

function updateResetButton(state = currentState) {
  const button = document.getElementById("resetButton");
  if (!button) return;

  const requiredVotes = getRequiredResetVotes(state);
  const voteCount = getResetVoteCount(state);

  button.textContent = requiredVotes > 1
    ? `Neues Spiel ${Math.min(voteCount, requiredVotes)}/${requiredVotes}`
    : "Neues Spiel";
}

function clearRoleSelection() {
  selectedRole = "";

  const roleInput = document.getElementById("roleInput");
  if (roleInput) {
    roleInput.value = "";
  }

  document.querySelectorAll(".role-button").forEach(button => {
    button.classList.remove("active");
  });
}

function isLastPlayerReroll(selection) {
  const event = currentState.lastPlayerReroll;

  if (!event?.eventId || seenPlayerRerollEvents.has(event.eventId)) return false;

  return event.playerKey === normalizePlayerName(selection.playerName);
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function showError(message) {
  document.getElementById("error").innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function clearError() {
  document.getElementById("error").innerHTML = "";
}

function getStateSignature(state) {
  const playerName = localStorage.getItem("braveryPlayerName") || "";
  const playerKey = normalizePlayerName(playerName);
  const playerRoll = state.rolls?.[playerKey] || [];

  return JSON.stringify({
    version: state.version || "",
    playerName,
    playerRoll: playerRoll.map(champion => champion.id),
    itemVotes: (state.itemVotes || []).map(vote => [
      vote.voterKey,
      vote.targetPlayerKey,
      vote.itemIndex,
      vote.itemId
    ]),
    resetVotes: (state.resetVotes || []).map(vote => vote.voterKey),
    lastItemReroll: state.lastItemReroll?.eventId || "",
    lastPlayerReroll: state.lastPlayerReroll?.eventId || "",
    selections: (state.selections || []).map(selection => ({
      playerName: selection.playerName,
      championId: selection.champion?.id,
      role: selection.role,
      items: (selection.items || []).map(item => item.id || item.name),
      starterItem: selection.starterItem?.id || selection.starterItem?.name || "",
      summonerSpells: (selection.summonerSpells || []).map(spell => spell.id || spell.name),
      skillOrder: (selection.skillOrder || []).map(spell => spell.id || spell.key || spell.name || spell)
    }))
  });
}

function getItemVoteCount(selection, item, itemIndex) {
  const targetPlayerKey = normalizePlayerName(selection.playerName);

  return (currentState.itemVotes || []).filter(vote =>
    vote.targetPlayerKey === targetPlayerKey &&
    Number(vote.itemIndex) === Number(itemIndex) &&
    String(vote.itemId) === String(item.id)
  ).length;
}

function getUsedVoteCount(playerName) {
  const voterKey = normalizePlayerName(playerName);

  return (currentState.itemVotes || []).filter(vote => vote.voterKey === voterKey).length;
}

function hasVotedForItem(playerName, selection, item, itemIndex) {
  const voterKey = normalizePlayerName(playerName);
  const targetPlayerKey = normalizePlayerName(selection.playerName);

  return (currentState.itemVotes || []).some(vote =>
    vote.voterKey === voterKey &&
    vote.targetPlayerKey === targetPlayerKey &&
    Number(vote.itemIndex) === Number(itemIndex) &&
    String(vote.itemId) === String(item.id)
  );
}

function isLastRerolledItem(selection, item, itemIndex) {
  const event = currentState.lastItemReroll;

  if (!event?.eventId || seenItemRerollEvents.has(event.eventId)) return false;

  return (
    event.targetPlayerKey === normalizePlayerName(selection.playerName) &&
    Number(event.itemIndex) === Number(itemIndex) &&
    String(event.newItemId) === String(item.id)
  );
}

function markRerollEventsSeen(state) {
  if (state.lastItemReroll?.eventId) {
    seenItemRerollEvents.add(state.lastItemReroll.eventId);
    persistSeenRerollEvents("braverySeenItemRerolls", seenItemRerollEvents);
  }

  if (state.lastPlayerReroll?.eventId) {
    seenPlayerRerollEvents.add(state.lastPlayerReroll.eventId);
    persistSeenRerollEvents("braverySeenPlayerRerolls", seenPlayerRerollEvents);
  }
}

function renderItemList(selection, extraClass = "", showNames = true) {
  const items = selection.items || [];

  if (items.length === 0) {
    return "";
  }

  const currentPlayerName = localStorage.getItem("braveryPlayerName") || "";
  const usedVotes = getUsedVoteCount(currentPlayerName);
  const isOwnSelection = normalizePlayerName(selection.playerName) === normalizePlayerName(currentPlayerName);
  const canSelfSwap = currentPlayerName && isOwnSelection && usedVotes >= ITEM_VOTES_PER_PLAYER;

  return `
    <div class="item-list ${escapeHtml(extraClass)}">
      ${items.map((item, itemIndex) => {
        const voteCount = getItemVoteCount(selection, item, itemIndex);
        const voteClass = voteCount >= 2 ? "item-vote-hot" : voteCount === 1 ? "item-vote-warm" : "";
        const hasAlreadyVoted = hasVotedForItem(currentPlayerName, selection, item, itemIndex);
        const canVote = currentPlayerName && !isOwnSelection && usedVotes < ITEM_VOTES_PER_PLAYER && !hasAlreadyVoted;
        const rerollClass = isLastRerolledItem(selection, item, itemIndex) ? "item-rerolled" : "";
        const titleParts = [item.name];

        if (voteCount > 0) {
          titleParts.push(`${voteCount} Vote${voteCount === 1 ? "" : "s"}`);
        }

        if (hasAlreadyVoted) {
          titleParts.push("von dir gevoted");
        }

        if (canSelfSwap) {
          titleParts.push("Eigenes Item tauschbar");
        }

        return `
          <div class="item-card ${voteClass} ${rerollClass}" title="${escapeHtml(titleParts.join(" · "))}">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />
            ${showNames ? `<span>${escapeHtml(item.name)}</span>` : ""}
            ${canVote ? `
              <button
                type="button"
                class="item-vote-button"
                data-vote-player="${escapeHtml(selection.playerName)}"
                data-vote-index="${itemIndex}"
                aria-label="Gegen ${escapeHtml(item.name)} voten"
              >Vote</button>
            ` : ""}
            ${canSelfSwap ? `
              <button
                type="button"
                class="item-self-reroll-button"
                data-self-reroll-index="${itemIndex}"
                aria-label="${escapeHtml(item.name)} neu würfeln"
              >Ändern</button>
            ` : ""}
            ${!canVote && !canSelfSwap && voteCount > 0 ? `<span class="item-vote-dot" aria-label="${voteCount} Votes"></span>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderStarterItem(starterItem, extraClass = "", showName = true) {
  if (!starterItem) {
    return "";
  }

  return `
    <div class="starter-item ${escapeHtml(extraClass)}" title="${escapeHtml(starterItem.name)}">
      <span class="starter-label">Starter</span>
      <img
        src="${escapeHtml(starterItem.imageUrl)}"
        alt="${escapeHtml(starterItem.name)}"
      />
      ${showName ? `<span class="starter-name">${escapeHtml(starterItem.name)}</span>` : ""}
    </div>
  `;
}

function renderSummonerSpells(summonerSpells) {
  if (!Array.isArray(summonerSpells) || summonerSpells.length === 0) {
    return "";
  }

  return summonerSpells.map(spell => `
    <div class="summoner-spell" title="${escapeHtml(spell.name)}">
      ${spell.imageUrl ? `<img src="${escapeHtml(spell.imageUrl)}" alt="${escapeHtml(spell.name)}" />` : `<span>${escapeHtml(spell.name)}</span>`}
    </div>
  `).join("");
}

function renderSkillOrder(skillOrder) {
  if (!Array.isArray(skillOrder) || skillOrder.length === 0) {
    return "";
  }

  return `
    <div class="skill-order" title="Max-Reihenfolge ohne R">
      <span>Skill</span>
      ${skillOrder.map((spell, index) => {
        const spellData = typeof spell === "string" ? { key: spell, name: spell } : spell;
        const spellLabel = spellData.key
          ? `${spellData.key}: ${spellData.name || spellData.key}`
          : spellData.name || "Spell";

        return `
          <div class="skill-spell" title="${escapeHtml(spellLabel)}">
            ${spellData.imageUrl
              ? `<img src="${escapeHtml(spellData.imageUrl)}" alt="${escapeHtml(spellLabel)}" />`
              : `<strong>${escapeHtml(spellData.key || spellData.name || "?")}</strong>`}
          </div>${index < skillOrder.length - 1 ? `<em>›</em>` : ""}
        `;
      }).join("")}
    </div>
  `;
}

function renderBanButton(selection) {
  const currentPlayerName = localStorage.getItem("braveryPlayerName") || "";
  const isOwnSelection = normalizePlayerName(selection.playerName) === normalizePlayerName(currentPlayerName);

  if (!isOwnSelection) {
    return "";
  }

  return `
    <button
      type="button"
      class="ban-reroll-button"
      data-ban-reroll="${escapeHtml(selection.playerName)}"
      title="Champion ist banned: deinen kompletten Build neu würfeln"
    >Banned</button>
  `;
}

function renderRunes(runes, summonerSpells) {
  if (!runes && (!Array.isArray(summonerSpells) || summonerSpells.length === 0)) {
    return "";
  }

  const allRunes = runes ? [
    runes.keystone,
    ...(runes.primaryRunes || []),
    ...(runes.secondaryRunes || []),
    ...(runes.statShards || [])
  ].filter(Boolean) : [];

  return `
    <div class="rune-build compact-runes">
      ${allRunes.map(rune => `
        <div class="rune-icon" title="${escapeHtml(rune.name)}">
          <img src="${escapeHtml(rune.iconUrl)}" alt="${escapeHtml(rune.name)}" />
        </div>
      `).join("")}
      ${renderSummonerSpells(summonerSpells)}
    </div>
  `;
}

function renderItemBuild(selection, options = {}) {
  const showNames = options.showNames !== false;
  const locked = options.locked === true;

  return `
    <div class="item-build ${locked ? "item-build-locked" : ""}">
      <div class="starter-rune-row">
        ${renderStarterItem(selection.starterItem, locked ? "locked-starter" : "", showNames)}
        ${renderRunes(selection.runes, selection.summonerSpells)}
        ${renderSkillOrder(selection.skillOrder)}
      </div>

      ${renderItemList(selection, locked ? "locked-items" : "", showNames)}
    </div>
  `;
}

function attachVoteHandlers() {
  document.querySelectorAll("[data-vote-player]").forEach(button => {
    button.addEventListener("click", () => {
      voteItem(button.dataset.votePlayer, Number(button.dataset.voteIndex));
    });
  });

  document.querySelectorAll("[data-ban-reroll]").forEach(button => {
    button.addEventListener("click", () => {
      rerollOwnBuild();
    });
  });

  document.querySelectorAll("[data-self-reroll-index]").forEach(button => {
    button.addEventListener("click", () => {
      rerollOwnItem(Number(button.dataset.selfRerollIndex));
    });
  });
}

function renderPlayers(selections) {
  const players = document.getElementById("players");

  if (!selections || selections.length === 0) {
    players.style.display = "none";
    players.innerHTML = "";
    return;
  }

  players.style.display = "block";

  players.innerHTML = `
    <h3>Ausgewählte Champions</h3>

    <div class="player-selection-list">
      ${selections.map(selection => {
        const currentPlayerName = localStorage.getItem("braveryPlayerName") || "";
        const isOwnSelection = normalizePlayerName(selection.playerName) === normalizePlayerName(currentPlayerName);
        const rerollClass = isLastPlayerReroll(selection) ? "player-rerolled" : "";

        return `
        <div class="player-selection-card player-selection-card-full ${isOwnSelection ? "own-selection" : ""} ${rerollClass}">
          ${renderBanButton(selection)}

          <div class="player-selection-main">
            <img
              src="${escapeHtml(selection.champion.imageUrl || selection.champion.splashUrl)}"
              alt="${escapeHtml(selection.champion.name)}"
            />

            <div>
              <strong>${escapeHtml(selection.playerName)}</strong>
              <span>
                ${escapeHtml(selection.champion.name)}
                ${selection.role ? `· ${escapeHtml(roleLabels[selection.role] || selection.role)}` : ""}
              </span>
            </div>
          </div>

          ${renderItemBuild(selection, { showNames: true })}
        </div>
      `}).join("")}
    </div>
  `;

  attachVoteHandlers();
}

function renderState(state, options = {}) {
  currentState = state;
  updateResetButton(state);

  const signature = getStateSignature(state);

  if (!options.force && signature === lastRenderedSignature) {
    return;
  }

  lastRenderedSignature = signature;

  const container = document.getElementById("champions");
  const rollButton = document.getElementById("rollButton");
  const roleSelect = document.getElementById("roleSelect");

  const playerName = localStorage.getItem("braveryPlayerName") || "";
  const playerKey = normalizePlayerName(playerName);
  const champions = state.rolls?.[playerKey] || [];
  const selections = state.selections || [];
  const currentPlayerSelection = getCurrentPlayerSelection(selections);

  rollButton.disabled = Boolean(currentPlayerSelection) || champions.length > 0;

  if (champions.length === 0) {
    container.innerHTML = "";

    roleSelect.style.display = "none";
    clearRoleSelection();
    renderPlayers(selections);

    if (selections.length > 0) {
      const usedVotes = getUsedVoteCount(playerName);
      const voteText = currentPlayerSelection ? ` · Votes ${usedVotes}/${ITEM_VOTES_PER_PLAYER}` : "";
      const resetText = getRequiredResetVotes(state) > 1 ? ` · Reset ${getResetVoteCount(state)}/${getRequiredResetVotes(state)}` : "";
      setStatus(`Patch ${state.version || "unbekannt"} · Runde läuft${voteText}${resetText}`);
    } else {
      setStatus("Bereit");
    }

    markRerollEventsSeen(state);
    return;
  }

  if (currentPlayerSelection) {
    roleSelect.style.display = "none";
    clearRoleSelection();

    container.innerHTML = `
      <div class="locked-choice">
        <h3>Deine Wahl ist gespeichert</h3>

        <div class="player-selection-card large own-selection ${isLastPlayerReroll(currentPlayerSelection) ? "player-rerolled" : ""}">
          ${renderBanButton(currentPlayerSelection)}
          <img
            src="${escapeHtml(currentPlayerSelection.champion.imageUrl || currentPlayerSelection.champion.splashUrl)}"
            alt="${escapeHtml(currentPlayerSelection.champion.name)}"
          />

          <div>
            <strong>${escapeHtml(currentPlayerSelection.playerName)}</strong>
            <span>
              ${escapeHtml(currentPlayerSelection.champion.name)}
              ${currentPlayerSelection.role ? `· ${escapeHtml(roleLabels[currentPlayerSelection.role] || currentPlayerSelection.role)}` : ""}
            </span>
          </div>
        </div>

        ${renderItemBuild(currentPlayerSelection, {
          showNames: false,
          locked: true
        })}

        <p>Du kannst deine Auswahl in dieser Runde nicht mehr ändern.</p>
      </div>
    `;
  } else {
    roleSelect.style.display = "block";

    const revealClass = options.animateChampions ? "" : "no-reveal";

    container.innerHTML = `
      ${champions.map(champion => `
        <article class="champion-card ${revealClass}">
          <img src="${escapeHtml(champion.splashUrl)}" alt="${escapeHtml(champion.name)}" />

          <div class="champion-body">
            <h3>${escapeHtml(champion.name)}</h3>
            <p>${escapeHtml(champion.title)}</p>

            <button type="button" data-champion-id="${escapeHtml(champion.id)}">
              Auswählen
            </button>
          </div>
        </article>
      `).join("")}

      <article class="champion-card champion-random-card ${revealClass}">
        <div class="random-champion-symbol" aria-hidden="true">?</div>

        <div class="champion-body">
          <h3>Zufall</h3>
          <p>Komplett zufälliger Champion aus dem Pool.</p>

          <button type="button" data-champion-id="random">
            ? auswählen
          </button>
        </div>
      </article>
    `;

    document.querySelectorAll("[data-champion-id]").forEach(button => {
      button.addEventListener("click", () => selectChampion(button.dataset.championId));
    });
  }

  renderPlayers(selections);

  const usedVotes = getUsedVoteCount(playerName);
  const voteText = currentPlayerSelection ? ` · Votes ${usedVotes}/${ITEM_VOTES_PER_PLAYER}` : "";
  const resetText = getRequiredResetVotes(state) > 1 ? ` · Reset ${getResetVoteCount(state)}/${getRequiredResetVotes(state)}` : "";
  setStatus(`Patch ${state.version || "unbekannt"} · Runde läuft${voteText}${resetText}`);
  markRerollEventsSeen(state);
}

async function loadState() {
  try {
    clearError();

    const response = await fetch("/api/bravery/state");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Status konnte nicht geladen werden");
    }

    renderState(data);
  } catch (error) {
    showError(error.message);
    setStatus("Fehler");
  }
}

async function rollChampions() {
  const container = document.getElementById("champions");
  const rollButton = document.getElementById("rollButton");

  try {
    clearError();
    setStatus("Würfle Champions...");

    rollButton.disabled = true;

    container.classList.add("rolling");
    container.innerHTML = "";

    const playerName = getPlayerName();

    if (!playerName) {
      throw new Error("Bitte gib einen Spielernamen ein.");
    }

    const response = await fetch("/api/bravery/roll", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Champions konnten nicht gewürfelt werden");
    }

    await new Promise(resolve => setTimeout(resolve, 450));

    container.classList.remove("rolling");

    renderState(data, {
      force: true,
      animateChampions: true
    });
  } catch (error) {
    container.classList.remove("rolling");
    showError(error.message);
    await loadState();
  }
}

async function selectChampion(championId) {
  try {
    clearError();

    const playerName = getPlayerName();

    if (!playerName) {
      throw new Error("Bitte gib einen Spielernamen ein");
    }

    const role = document.getElementById("roleInput").value;

    if (!role) {
      throw new Error("Bitte wähle zuerst eine Rolle.");
    }

    const existingSelection = getCurrentPlayerSelection(currentState.selections || []);

    if (existingSelection) {
      throw new Error("Du hast bereits einen Champion gewählt.");
    }

    const response = await fetch("/api/bravery/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName,
        championId,
        role
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Champion konnte nicht gewählt werden");
    }

    renderState(data, {
      force: true
    });
  } catch (error) {
    showError(error.message);
  }
}

async function voteItem(targetPlayerName, itemIndex) {
  try {
    clearError();

    const playerName = getPlayerName();

    if (!playerName) {
      throw new Error("Bitte gib einen Spielernamen ein.");
    }

    const response = await fetch("/api/bravery/item-vote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName,
        targetPlayerName,
        itemIndex
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Vote konnte nicht gespeichert werden");
    }

    lastRenderedSignature = "";
    renderState(data, { force: true });
  } catch (error) {
    showError(error.message);
  }
}

async function rerollOwnBuild() {
  const confirmed = confirm(
    "Ist dein Champion gebannt?\n\nDann wird nur dein eigener Champion inklusive Build, Runen, Summoner Spells und Skill Order neu gewürfelt."
  );

  if (!confirmed) {
    return;
  }

  try {
    clearError();

    const playerName = getPlayerName();

    if (!playerName) {
      throw new Error("Bitte gib einen Spielernamen ein.");
    }

    const response = await fetch("/api/bravery/reroll-player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Dein Build konnte nicht neu gewürfelt werden");
    }

    lastRenderedSignature = "";
    renderState(data, { force: true });
  } catch (error) {
    showError(error.message);
  }
}

async function rerollOwnItem(itemIndex) {
  const confirmed = confirm(
    "Dieses eigene Item neu würfeln?\n\nDer Button ist nur verfügbar, nachdem du deine 3 Votes benutzt hast."
  );

  if (!confirmed) {
    return;
  }

  try {
    clearError();

    const playerName = getPlayerName();

    if (!playerName) {
      throw new Error("Bitte gib einen Spielernamen ein.");
    }

    const response = await fetch("/api/bravery/item-swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName,
        itemIndex
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Item konnte nicht neu gewürfelt werden");
    }

    lastRenderedSignature = "";
    renderState(data, { force: true });
  } catch (error) {
    showError(error.message);
  }
}

async function resetGame() {
  const requiredVotes = getRequiredResetVotes(currentState);
  const resetVotes = getResetVoteCount(currentState);
  const message = requiredVotes > 1
    ? `Neues Spiel anfragen?\n\nAb 3 Spielern werden 2 Stimmen benötigt. Aktuell: ${resetVotes}/${requiredVotes}.`
    : "Möchtest du wirklich ein neues Spiel starten?\n\nAlle gewürfelten Champions, Items, Runen, Summoner Spells, Skill Orders und Votes werden gelöscht.";

  const confirmed = confirm(message);

  if (!confirmed) {
    return;
  }

  try {
    clearError();

    const playerName = requiredVotes > 1
      ? getPlayerName()
      : (localStorage.getItem("braveryPlayerName") || "");

    if (requiredVotes > 1 && !playerName) {
      throw new Error("Bitte gib einen Spielernamen ein.");
    }

    const response = await fetch("/api/bravery/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Neues Spiel konnte nicht gestartet werden");
    }

    if (!(data.selections || []).length && !Object.keys(data.rolls || {}).length) {
      clearRoleSelection();
    }

    lastRenderedSignature = "";

    renderState(data, {
      force: true
    });
  } catch (error) {
    showError(error.message);
  }
}

document.getElementById("rollButton").addEventListener("click", rollChampions);
document.getElementById("resetButton").addEventListener("click", resetGame);

document.querySelectorAll(".role-button").forEach(button => {
  button.addEventListener("click", () => {
    selectedRole = button.dataset.role;

    document.getElementById("roleInput").value = selectedRole;

    document.querySelectorAll(".role-button").forEach(roleButton => {
      roleButton.classList.remove("active");
    });

    button.classList.add("active");

    clearError();
  });
});

loadState();

setInterval(loadState, 3000);
