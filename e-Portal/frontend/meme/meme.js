let currentState = null;
let pollingInProgress = false;
let actionInProgress = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function getPlayerName() {
  return localStorage.getItem("memePlayerName") || "";
}

function setPlayerName(name) {
  localStorage.setItem("memePlayerName", String(name || "").trim());
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

function formatTimer(ms) {
  const totalSeconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getPhaseText(phase) {
  const map = {
    lobby: ["Lobby", "Joine die Lobby und starte die erste Runde."],
    writing: ["Writing", "Schreibe deine Caption. Andere Captions bleiben verborgen."],
    voting: ["Voting", "Vote einmal für das beste Meme. Eigenvote ist gesperrt."],
    results: ["Results", "Rundengewinner und Scoreboard."]
  };

  return map[phase] || map.lobby;
}

function renderPlayers(players) {
  const ownKey = normalizeName(getPlayerName());
  const safePlayers = Array.isArray(players) ? players : [];

  if (safePlayers.length === 0) {
    return `<div class="empty-note">Noch keine Spieler in der Lobby.</div>`;
  }

  return `
    <div class="player-list">
      ${safePlayers.map(player => `
        <div class="player-pill ${player.key === ownKey ? "own" : ""}">
          <strong>${escapeHtml(player.name)}</strong>
          ${player.key === ownKey ? `<span>Du</span>` : `<span>Lobby</span>`}
        </div>
      `).join("")}
    </div>
  `;
}

function renderScoreboard(scoreboard) {
  const rows = Array.isArray(scoreboard) ? scoreboard : [];

  if (rows.length === 0) {
    return `<div class="empty-note">Noch kein Scoreboard.</div>`;
  }

  return `
    <div class="scoreboard">
      ${rows.map((row, index) => `
        <div class="score-row">
          <strong>${index + 1}. ${escapeHtml(row.playerName)}</strong>
          <span>${Number(row.score) || 0} Punkte</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTemplate(template) {
  if (!template) {
    return `<div class="template-card"><div class="empty-note">Kein Template gewählt.</div></div>`;
  }

  return `
    <div class="template-card">
      <img src="${escapeHtml(template.imagePath)}" alt="${escapeHtml(template.name)}" />
      <div class="template-name">${escapeHtml(template.name)}</div>
    </div>
  `;
}

function renderLobby(state) {
  return `
    <div class="lobby-grid">
      <div class="side-card">
        <div class="section-title">Lobby</div>
        ${renderPlayers(state.players)}
        <div class="action-row">
          <button type="button" data-action="start">Runde starten</button>
          <button type="button" class="danger" data-action="reset">Reset</button>
        </div>
      </div>
      <div class="side-card">
        <div class="section-title">Scoreboard</div>
        ${renderScoreboard(state.scoreboard)}
      </div>
    </div>
  `;
}

function renderWriting(state) {
  const player = state.currentPlayer || {};
  const hasSubmitted = player.hasSubmitted === true;
  const ownSubmission = (state.submissions || []).find(submission => submission.isOwn);
  const focused = document.activeElement?.id === "captionInput";
  const currentValue = focused ? document.getElementById("captionInput")?.value || "" : "";

  return `
    <div class="meme-stage">
      ${renderTemplate(state.currentTemplate)}
      <div class="caption-card">
        <div class="section-title">Deine Caption</div>
        ${hasSubmitted ? `
          <div class="caption-preview">${escapeHtml(ownSubmission?.caption || "Abgegeben")}</div>
          <div class="submitted-note"><strong>Abgegeben.</strong> Warte auf die anderen Spieler.</div>
        ` : `
          <textarea id="captionInput" maxlength="180" placeholder="Schreib etwas maximal Dummes...">${escapeHtml(currentValue)}</textarea>
          <div class="caption-actions">
            <button type="button" data-action="submit">Caption abgeben</button>
          </div>
        `}
        <div class="submitted-note">Abgegeben: ${state.submissions.length}/${state.players.length}</div>
      </div>
    </div>
  `;
}

function renderVoting(state) {
  const currentPlayer = state.currentPlayer || {};
  const votedSubmissionId = currentPlayer.votedSubmissionId;
  const submissions = Array.isArray(state.submissions) ? state.submissions : [];

  if (submissions.length <= 1) {
    return `<div class="empty-note">Zu wenige Memes für Voting. Ergebnis wird automatisch angezeigt.</div>`;
  }

  return `
    <div class="vote-grid">
      ${submissions.map(submission => {
        const isOwn = submission.isOwn;
        const isSelected = votedSubmissionId === submission.id;
        return `
          <div class="vote-card ${isOwn ? "own" : ""} ${isSelected ? "selected" : ""}">
            <div class="vote-template">
              <img src="${escapeHtml(state.currentTemplate?.imagePath || "")}" alt="${escapeHtml(state.currentTemplate?.name || "Meme")}" />
            </div>
            <div class="caption-text">${escapeHtml(submission.caption || "")}</div>
            <div class="card-meta">
              <span>${escapeHtml(submission.playerName)}</span>
              ${isOwn ? `<span>Eigenes Meme</span>` : isSelected ? `<span>Dein Vote</span>` : `<span>Vote offen</span>`}
            </div>
            ${!isOwn && !currentPlayer.hasVoted ? `<button type="button" data-vote-id="${escapeHtml(submission.id)}">Voten</button>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderResults(state) {
  const result = state.roundResult || {};
  const submissions = Array.isArray(result.submissions) ? result.submissions : [];
  const winners = Array.isArray(result.winners) ? result.winners : [];
  const winnerText = winners.length > 0
    ? winners.map(winner => winner.playerName).join(", ")
    : "Kein Gewinner";

  return `
    <div class="winner-banner">Rundengewinner: ${escapeHtml(winnerText)}</div>
    <div class="result-grid">
      <div>
        <div class="vote-grid">
          ${submissions.map(submission => `
            <div class="result-card">
              <div class="vote-template">
                <img src="${escapeHtml(state.currentTemplate?.imagePath || "")}" alt="${escapeHtml(state.currentTemplate?.name || "Meme")}" />
              </div>
              <div class="caption-text">${escapeHtml(submission.caption || "")}</div>
              <div class="card-meta">
                <strong>${escapeHtml(submission.playerName)}</strong>
                <span class="vote-count">${Number(submission.votes) || 0}</span>
              </div>
            </div>
          `).join("") || `<div class="empty-note">Keine Memes abgegeben.</div>`}
        </div>
        <div class="action-row">
          <button type="button" data-action="next">Nächste Runde</button>
          <button type="button" class="danger" data-action="reset">Reset</button>
        </div>
      </div>
      <div class="side-card">
        <div class="section-title">Scoreboard</div>
        ${renderScoreboard(state.scoreboard)}
      </div>
    </div>
  `;
}

function renderState(state) {
  currentState = state;

  const [phaseTitle, phaseDescription] = getPhaseText(state.phase);
  document.getElementById("phaseTitle").textContent = `${phaseTitle}${state.round ? ` · Runde ${state.round}` : ""}`;
  document.getElementById("phaseDescription").textContent = phaseDescription;
  document.getElementById("timer").textContent = state.phase === "writing" || state.phase === "voting"
    ? formatTimer(state.timeRemainingMs)
    : "--";

  const playerNameInput = document.getElementById("playerNameInput");
  if (playerNameInput && !playerNameInput.value && getPlayerName()) {
    playerNameInput.value = getPlayerName();
  }

  const app = document.getElementById("app");
  const wasTypingCaption = state.phase === "writing" && document.activeElement?.id === "captionInput";
  const captionSelectionStart = wasTypingCaption ? document.getElementById("captionInput")?.selectionStart || 0 : 0;
  const captionSelectionEnd = wasTypingCaption ? document.getElementById("captionInput")?.selectionEnd || captionSelectionStart : captionSelectionStart;

  if (state.phase === "writing") {
    app.innerHTML = renderWriting(state);

    if (wasTypingCaption && !(state.currentPlayer || {}).hasSubmitted) {
      const captionInput = document.getElementById("captionInput");
      if (captionInput) {
        captionInput.focus();
        captionInput.setSelectionRange(captionSelectionStart, captionSelectionEnd);
      }
    }
  } else if (state.phase === "voting") {
    app.innerHTML = renderVoting(state);
  } else if (state.phase === "results") {
    app.innerHTML = renderResults(state);
  } else {
    app.innerHTML = renderLobby(state);
  }

  attachHandlers();
  setStatus(`${state.players.length} Spieler · ${phaseTitle}`);
}

function attachHandlers() {
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "start") startRound();
      if (action === "submit") submitCaption();
      if (action === "next") nextRound();
      if (action === "reset") resetMeme();
    });
  });

  document.querySelectorAll("[data-vote-id]").forEach(button => {
    button.addEventListener("click", () => voteMeme(button.dataset.voteId));
  });
}

async function apiRequest(path, body = null) {
  if (actionInProgress) return null;
  actionInProgress = true;

  try {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Aktion fehlgeschlagen");
    }

    clearError();
    renderState(data);
    return data;
  } catch (error) {
    showError(error.message);
    return null;
  } finally {
    actionInProgress = false;
  }
}

async function loadState() {
  if (pollingInProgress) return;
  pollingInProgress = true;

  try {
    const params = new URLSearchParams();
    const playerName = getPlayerName();
    if (playerName) params.set("playerName", playerName);

    const response = await fetch(`/api/meme/state?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "State konnte nicht geladen werden");
    }

    renderState(data);
    clearError();
  } catch (error) {
    showError(error.message);
    setStatus("Fehler");
  } finally {
    pollingInProgress = false;
  }
}

async function joinLobby(event) {
  event.preventDefault();
  const name = document.getElementById("playerNameInput").value.trim();

  if (!name) {
    showError("Bitte gib einen Namen ein.");
    return;
  }

  setPlayerName(name);
  await apiRequest("/api/meme/join", { playerName: name });
}

function requirePlayerName() {
  const name = getPlayerName() || document.getElementById("playerNameInput")?.value.trim();

  if (!name) {
    throw new Error("Bitte zuerst mit Namen joinen.");
  }

  setPlayerName(name);
  return name;
}

async function startRound() {
  try {
    await apiRequest("/api/meme/start", { playerName: requirePlayerName() });
  } catch (error) {
    showError(error.message);
  }
}

async function submitCaption() {
  try {
    const caption = document.getElementById("captionInput")?.value.trim() || "";
    await apiRequest("/api/meme/submit", {
      playerName: requirePlayerName(),
      caption
    });
  } catch (error) {
    showError(error.message);
  }
}

async function voteMeme(submissionId) {
  try {
    await apiRequest("/api/meme/vote", {
      playerName: requirePlayerName(),
      submissionId
    });
  } catch (error) {
    showError(error.message);
  }
}

async function nextRound() {
  try {
    await apiRequest("/api/meme/next", { playerName: requirePlayerName() });
  } catch (error) {
    showError(error.message);
  }
}

async function resetMeme() {
  if (!confirm("Meme-Lobby wirklich komplett zurücksetzen?")) return;
  await apiRequest("/api/meme/reset", {});
}

document.getElementById("joinForm").addEventListener("submit", joinLobby);

const savedName = getPlayerName();
if (savedName) {
  document.getElementById("playerNameInput").value = savedName;
}

loadState();
setInterval(loadState, 1500);
setInterval(() => {
  if (!currentState || !["writing", "voting"].includes(currentState.phase)) return;
  currentState.timeRemainingMs = Math.max(0, (Number(currentState.timeRemainingMs) || 0) - 1000);
  document.getElementById("timer").textContent = formatTimer(currentState.timeRemainingMs);
}, 1000);
