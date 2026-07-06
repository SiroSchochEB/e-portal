let currentState = {
  champions: [],
  rolls: {},
  selections: []
};

let selectedRole = "";
let lastRenderedSignature = "";

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
    selection => selection.playerName.toLowerCase() === playerName.toLowerCase()
  );
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
  const playerKey = playerName.toLowerCase();
  const playerRoll = state.rolls?.[playerKey] || [];

  return JSON.stringify({
    version: state.version || "",
    playerName,
    playerRoll: playerRoll.map(champion => champion.id),
    selections: (state.selections || []).map(selection => ({
      playerName: selection.playerName,
      championId: selection.champion?.id,
      role: selection.role,
      items: (selection.items || []).map(item => item.id || item.name),
      starterItem: selection.starterItem?.id || selection.starterItem?.name || ""
    }))
  });
}

function renderItemList(items, extraClass = "", showNames = true) {
  if (!items || items.length === 0) {
    return "";
  }

  return `
    <div class="item-list ${escapeHtml(extraClass)}">
      ${items.map(item => `
        <div class="item-card" title="${escapeHtml(item.name)}">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />
          ${showNames ? `<span>${escapeHtml(item.name)}</span>` : ""}
        </div>
      `).join("")}
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

function renderItemBuild(selection, options = {}) {
  const showNames = options.showNames !== false;
  const locked = options.locked === true;

  return `
    <div class="item-build ${locked ? "item-build-locked" : ""}">
      <div class="starter-rune-row">
        ${renderStarterItem(selection.starterItem, locked ? "locked-starter" : "", showNames)}
        ${renderRunes(selection.runes)}
      </div>

      ${renderItemList(selection.items || [], locked ? "locked-items" : "", showNames)}
    </div>
  `;
}

function renderRunes(runes) {
  if (!runes) {
    return "";
  }

  const allRunes = [
    runes.keystone,
    ...(runes.primaryRunes || []),
    ...(runes.secondaryRunes || []),
    ...(runes.statShards || [])
  ].filter(Boolean);

  return `
    <div class="rune-build compact-runes">
      ${allRunes.map(rune => `
        <div class="rune-icon" title="${escapeHtml(rune.name)}">
          <img src="${escapeHtml(rune.iconUrl)}" alt="${escapeHtml(rune.name)}" />
        </div>
      `).join("")}
    </div>
  `;
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
      ${selections.map(selection => `
        <div class="player-selection-card player-selection-card-full">
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
      `).join("")}
    </div>
  `;
}

function renderState(state, options = {}) {
  currentState = state;

  const signature = getStateSignature(state);

  if (!options.force && signature === lastRenderedSignature) {
    return;
  }

  lastRenderedSignature = signature;

  const container = document.getElementById("champions");
  const rollButton = document.getElementById("rollButton");
  const roleSelect = document.getElementById("roleSelect");

  const playerName = localStorage.getItem("braveryPlayerName") || "";
  const playerKey = playerName.toLowerCase();
  const champions = state.rolls?.[playerKey] || [];
  const selections = state.selections || [];
  const currentPlayerSelection = getCurrentPlayerSelection(selections);

  rollButton.disabled = Boolean(currentPlayerSelection) || champions.length > 0;

  if (champions.length === 0) {
    container.innerHTML = "";

    roleSelect.style.display = "none";
    renderPlayers(selections);

    if (selections.length > 0) {
      setStatus(`Patch ${state.version || "unbekannt"} · Runde läuft`);
    } else {
      setStatus("Bereit");
    }

    return;
  }

  if (currentPlayerSelection) {
    roleSelect.style.display = "none";

    container.innerHTML = `
      <div class="locked-choice">
        <h3>Deine Wahl ist gespeichert</h3>

        <div class="player-selection-card large">
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

        ${renderRunes(currentPlayerSelection.runes)}

        <p>Du kannst deine Auswahl in dieser Runde nicht mehr ändern.</p>
      </div>
    `;
  } else {
    roleSelect.style.display = "block";

    const revealClass = options.animateChampions ? "" : "no-reveal";

    container.innerHTML = champions.map(champion => `
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
    `).join("");

    document.querySelectorAll("[data-champion-id]").forEach(button => {
      button.addEventListener("click", () => selectChampion(button.dataset.championId));
    });
  }

  renderPlayers(selections);
  setStatus(`Patch ${state.version || "unbekannt"} · Runde läuft`);
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

async function resetGame() {
  const confirmed = confirm(
    "Möchtest du wirklich ein neues Spiel starten?\n\nAlle gewürfelten Champions, Items und Runen werden gelöscht."
  );

  if (!confirmed) {
    return;
  }

  try {
    clearError();

    const response = await fetch("/api/bravery/reset", {
      method: "POST"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Neues Spiel konnte nicht gestartet werden");
    }

    localStorage.removeItem("braveryPlayerName");

    selectedRole = "";
    document.getElementById("roleInput").value = "";

    document.querySelectorAll(".role-button").forEach(button => {
      button.classList.remove("active");
    });

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