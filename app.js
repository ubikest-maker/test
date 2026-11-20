/* Ma Cinémathèque — gestion de collection de films (localStorage) */
(() => {
  "use strict";

  const STORAGE_KEY = "movie-collection:v1";
  const $ = (sel) => document.querySelector(sel);

  const state = {
    movies: load(),
    query: "",
    genre: "",
    status: "",
    sort: "title-asc",
    listView: false,
    page: 1,
    selected: new Set(),
    updating: false,
  };

  const PER_PAGE = 50;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.movies));
  }

  /* ---------- Données ---------- */

  function upsertMovie(movie) {
    if (movie.id) {
      const i = state.movies.findIndex((m) => m.id === movie.id);
      if (i !== -1) state.movies[i] = { ...state.movies[i], ...movie };
    } else {
      movie.id = crypto.randomUUID();
      movie.addedAt = new Date().toISOString();
      state.movies.push(movie);
    }
    save();
  }

  function deleteMovie(id) {
    state.movies = state.movies.filter((m) => m.id !== id);
    save();
    render();
  }

  /* ---------- Récupération d'infos TMDB ---------- */

  const TMDB_KEY_STORAGE = "movie-collection:tmdb-key";
  const tmdbKey = () => localStorage.getItem(TMDB_KEY_STORAGE) || "";

  async function tmdbGet(url) {
    let res = await fetch(url);
    if (res.status === 429) {
      await sleep(2000);
      res = await fetch(url);
    }
    if (!res.ok) {
      const err = new Error("HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function tmdbSearchUrl(key, title, year) {
    let url = "https://api.themoviedb.org/3/search/movie?api_key=" +
      encodeURIComponent(key) + "&language=fr-FR&query=" + encodeURIComponent(title);
    if (year) url += "&year=" + encodeURIComponent(year);
    return url;
  }

  function applyTmdbMovie(m, det) {
    m.title = det.title || m.title;
    m.year = (det.release_date || "").slice(0, 4) || m.year;
    m.director = (det.credits?.crew || []).filter((c) => c.job === "Director")
      .map((c) => c.name).join(", ") || m.director;
    m.actors = (det.credits?.cast || []).slice(0, 6).map((c) => c.name).join(", ") || m.actors;
    m.genre = (det.genres || []).map((g) => g.name).join(", ") || m.genre;
    m.runtime = det.runtime || m.runtime;
    m.rating = det.vote_average != null ? Number(det.vote_average.toFixed(1)) : m.rating;
    m.poster = det.poster_path ? "https://image.tmdb.org/t/p/w500" + det.poster_path : m.poster;
    m.notes = det.overview || m.notes;
  }

  async function tmdbUpdateSelected() {
    const ids = [...state.selected];
    const key = tmdbKey();
    if (!key) {
      alert("Saisissez d’abord votre clé API TMDB dans la fenêtre d’ajout (bouton 🔎 TMDB).");
      return;
    }
    if (!confirm(`Mettre à jour ${ids.length} film(s) via TMDB ?\nLes champs récupérés (titre, année, réalisateur, acteurs, genres, durée, note, affiche, synopsis) seront remplacés.`)) return;

    state.updating = true;
    $("#progress").classList.remove("hidden");
    let updated = 0, notFound = 0, failed = 0;

    for (let i = 0; i < ids.length; i++) {
      if (!state.updating) break;
      const m = state.movies.find((x) => x.id === ids[i]);
      if (!m) continue;
      $("#progress-text").textContent = `Mise à jour TMDB : ${i + 1} / ${ids.length} — ${escapeHtml(m.title)}`;
      try {
        const search = await tmdbGet(tmdbSearchUrl(key, m.title, m.year));
        const best = (search.results || [])[0];
        if (!best) {
          notFound++;
        } else {
          const det = await tmdbGet("https://api.themoviedb.org/3/movie/" + best.id +
            "?api_key=" + encodeURIComponent(key) + "&language=fr-FR&append_to_response=credits");
          applyTmdbMovie(m, det);
          updated++;
        }
      } catch (err) {
        if (err.status === 401) {
          alert("Clé API TMDB invalide (401) — mise à jour interrompue.");
          break;
        }
        failed++;
      }
      await sleep(150);
    }

    state.updating = false;
    $("#progress").classList.add("hidden");
    state.selected.clear();
    save();
    render();
    if (updated + notFound >= 0 && (updated || notFound || failed))
      alert(`Mise à jour TMDB terminée : ${updated} mis à jour, ${notFound} introuvable(s), ${failed} erreur(s).`);
  }

  function updateSelectionUi() {
    const n = state.selected.size;
    const btn = $("#btn-tmdb-update");
    btn.hidden = n === 0;
    btn.textContent = `Mettre à jour TMDB (${n})`;
  }

  async function tmdbFetch(url) {
    let res;
    try {
      res = await fetch(url);
    } catch {
      alert("Requête TMDB impossible (connexion ou bloqueur de publicités ?).");
      return null;
    }
    if (res.status === 401) {
      alert("Clé API TMDB invalide ou non confirmée (erreur 401).");
      return null;
    }
    if (!res.ok) {
      alert("Erreur TMDB : HTTP " + res.status);
      return null;
    }
    return res.json();
  }

  async function fillFromTmdbId(id, key) {
    const url = "https://api.themoviedb.org/3/movie/" + id +
      "?api_key=" + encodeURIComponent(key) +
      "&language=fr-FR&append_to_response=credits";
    const m = await tmdbFetch(url);
    if (!m) return;

    $("#f-title").value = m.title || $("#f-title").value;
    $("#f-year").value = (m.release_date || "").slice(0, 4) || "";
    $("#f-director").value = (m.credits?.crew || [])
      .filter((c) => c.job === "Director")
      .map((c) => c.name).join(", ");
    $("#f-actors").value = (m.credits?.cast || [])
      .slice(0, 6).map((c) => c.name).join(", ");
    $("#f-genre").value = (m.genres || []).map((g) => g.name).join(", ");
    $("#f-runtime").value = m.runtime || "";
    $("#f-rating").value = m.vote_average != null ? m.vote_average.toFixed(1) : "";
    $("#f-poster").value = m.poster_path
      ? "https://image.tmdb.org/t/p/w500" + m.poster_path : "";
    $("#f-notes").value = m.overview || "";
  }

  async function tmdbSearchAndFill() {
    const key = $("#f-tmdb-key").value.trim();
    if (!key) {
      alert("Saisissez d'abord votre clé API TMDB (gratuite : themoviedb.org -> Paramètres -> API).");
      $("#f-tmdb-key").focus();
      return;
    }
    localStorage.setItem(TMDB_KEY_STORAGE, key);

    const title = $("#f-title").value.trim();
    if (!title) {
      alert("Saisissez d'abord un titre, puis cliquez sur 🔎 TMDB.");
      $("#f-title").focus();
      return;
    }

    const year = $("#f-year").value;
    let url = "https://api.themoviedb.org/3/search/movie?api_key=" +
      encodeURIComponent(key) + "&language=fr-FR&query=" + encodeURIComponent(title);
    if (year) url += "&year=" + encodeURIComponent(year);

    const data = await tmdbFetch(url);
    if (!data) return;
    const results = (data.results || []).slice(0, 8);
    if (!results.length) {
      alert("Aucun résultat TMDB pour ce titre.");
      return;
    }

    if (results.length === 1) {
      await fillFromTmdbId(results[0].id, key);
      return;
    }

    $("#results-list").innerHTML = results.map((r) => {
      const y = (r.release_date || "").slice(0, 4) || "?";
      return `<button type="button" class="btn result" data-tid="${r.id}" data-key="${encodeURIComponent(key)}">` +
        `${escapeHtml(r.title)} <span class="muted">(${y}) — ★ ${(r.vote_average ?? 0).toFixed(1)}</span></button>`;
    }).join("");
    $("#tmdb-results").classList.remove("hidden");
  }

  /* ---------- Import XML (export Filmotech : Filmotech_Films > Film) ---------- */

  const txt = (parent, tag) => parent.querySelector(tag)?.textContent?.trim() || "";

  function extractPoster(commentaires) {
    const block = commentaires.match(/\[XBMC-POSTERS\]([\s\S]*?)\[\/XBMC-POSTERS\]/);
    const source = block ? block[1] : commentaires;
    const url = source.match(/https?:\/\/\S+/);
    return url ? url[0] : "";
  }

  function mapFilmotechFilm(film) {
    const filmVu = txt(film, "FilmVu").toUpperCase() === "OUI";
    const acteurs = txt(film, "Acteurs").split("\n").map((a) => a.trim()).filter(Boolean).join(", ");
    const note = Math.min(10, parseFloat(txt(film, "Note").replace(",", ".")) || 0);
    const duree = parseInt(txt(film, "Duree"), 10) || null;
    const annee = parseInt(txt(film, "Annee"), 10) || null;
    const externId = "filmotech-" + (txt(film, "ID") || encodeURIComponent(txt(film, "TitreVF")));
    const realisateur = (txt(film, "Realisateurs").split("\n")[0] || "").trim();

    return {
      title: txt(film, "TitreVF") || txt(film, "TitreVO") || "Sans titre",
      actors: acteurs,
      year: annee,
      director: realisateur,
      genre: txt(film, "Genre"),
      status: filmVu ? "vu" : "à voir",
      rating: note > 0 ? note : null,
      runtime: duree,
      poster: extractPoster(txt(film, "Commentaires")),
      notes: txt(film, "Synopsis"),
      externalId: externId,
    };
  }

  async function importFromXml(file) {
    let doc;
    try {
      const text = (await file.text())
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
      doc = new DOMParser().parseFromString(text, "application/xml");
    } catch {
      alert("Impossible de lire le fichier : XML invalide.");
      return;
    }
    if (doc.querySelector("parsererror")) {
      alert("Impossible de lire le fichier : XML invalide.");
      return;
    }

    const films = doc.querySelectorAll("Film");
    if (!films.length) {
      alert('Aucun élément <Film> trouvé. Structure attendue : export Filmotech (<Filmotech_Films><Film>…).');
      return;
    }

    const externIds = new Set(state.movies.map((m) => m.externalId).filter(Boolean));
    let added = 0, skipped = 0;

    films.forEach((film) => {
      const movie = mapFilmotechFilm(film);
      if (externIds.has(movie.externalId)) {
        skipped++;
        return;
      }
      movie.id = crypto.randomUUID();
      movie.addedAt = new Date().toISOString();
      state.movies.push(movie);
      externIds.add(movie.externalId);
      added++;
    });

    save();
    render();
    alert(`Import terminé : ${added} film${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}` +
      (skipped ? `, ${skipped} ignoré${skipped > 1 ? "s" : ""} (déjà présent${skipped > 1 ? "s" : ""})` : "."));
  }

  const escapeHtml = (s = "") =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  /* ---------- Filtrage / tri ---------- */

  function visibleMovies() {
    const q = state.query.toLowerCase();
    const list = state.movies.filter((m) => {
      const matchQ =
        !q ||
        m.title.toLowerCase().includes(q) ||
        (m.director || "").toLowerCase().includes(q) ||
        (m.genre || "").toLowerCase().includes(q);
      const matchGenre = !state.genre || m.genre === state.genre;
      const matchStatus = !state.status || m.status === state.status;
      return matchQ && matchGenre && matchStatus;
    });

    const cmp = {
      "title-asc": (a, b) => a.title.localeCompare(b.title, "fr"),
      "title-desc": (a, b) => b.title.localeCompare(a.title, "fr"),
      "year-desc": (a, b) => (b.year || 0) - (a.year || 0),
      "year-asc": (a, b) => (a.year || 9999) - (b.year || 9999),
      "rating-desc": (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      "rating-asc": (a, b) => (a.rating ?? 11) - (b.rating ?? 11),
      "added-desc": (a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""),
    };
    return list.sort(cmp[state.sort] || cmp["title-asc"]);
  }

  /* ---------- Rendu ---------- */

  function renderStats() {
    const total = state.movies.length;
    const seen = state.movies.filter((m) => m.status === "vu").length;
    const avg = (() => {
      const rated = state.movies.filter((m) => m.rating != null);
      return rated.length
        ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1)
        : "—";
    })();
    $("#stats").innerHTML =
      `<strong>${total}</strong> film${total > 1 ? "s" : ""} · ` +
      `<strong>${seen}</strong> vu${seen > 1 ? "s" : ""} · ` +
      `Note moyenne <strong>${avg}</strong>`;
  }

  function renderGenreOptions() {
    const genres = [...new Set(state.movies.map((m) => m.genre).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "fr"));
    const sel = $("#filter-genre");
    sel.innerHTML =
      '<option value="">Tous les genres</option>' +
      genres.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    sel.value = state.genre;
    $("#genre-list").innerHTML = genres
      .map((g) => `<option value="${escapeHtml(g)}"></option>`)
      .join("");
  }

  /* ---------- Fiche détaillée ---------- */

  let detailId = null;

  function openDetail(id) {
    const m = state.movies.find((x) => x.id === id);
    if (!m) return;
    detailId = id;
    $("#detail-poster").innerHTML = m.poster
      ? `<img src="${escapeHtml(m.poster)}" alt="Affiche de ${escapeHtml(m.title)}"
          onerror="this.parentElement.textContent='🎞️'">`
      : "🎞️";
    $("#detail-title").textContent = m.title;
    $("#detail-meta").textContent = [
      m.director && "Réalisé par " + m.director,
      m.year,
      m.runtime && m.runtime + " min",
    ].filter(Boolean).join(" · ");
    $("#detail-badges").innerHTML =
      `<span class="badge ${m.status === "vu" ? "vu" : ""}">${m.status === "vu" ? "Vu ✓" : "À voir"}</span>` +
      (m.rating != null ? `<span class="rating-pill">★ ${m.rating}</span>` : "");
    $("#detail-actors").textContent = m.actors ? "Avec : " + m.actors : "";
    $("#detail-actors").classList.toggle("hidden", !m.actors);
    $("#detail-synopsis").textContent = m.notes || "";
    $("#detail-synopsis").classList.toggle("hidden", !m.notes);
    $("#btn-detail-toggle").textContent = m.status === "vu" ? "Marquer à voir" : "Marquer vu";
    $("#detail-modal").classList.remove("hidden");
  }

  function closeDetail() {
    $("#detail-modal").classList.add("hidden");
    detailId = null;
  }

  function cardHtml(m) {
    const poster = m.poster
      ? `<img src="${escapeHtml(m.poster)}" alt="Affiche de ${escapeHtml(m.title)}" loading="lazy"
            onerror="this.remove()">`
      : "🎞️";
    const checked = state.selected.has(m.id) ? " checked" : "";
    const year = m.year ? ` · ${m.year}` : "";
    const runtime = m.runtime ? ` · ${m.runtime} min` : "";
    const rating = m.rating != null ? `<span class="rating-pill">★ ${m.rating}</span>` : "";
    const badge = `<span class="badge ${m.status === "vu" ? "vu" : ""}">${
      m.status === "vu" ? "Vu ✓" : "À voir"
    }</span>`;
    const actors = m.actors
      ? `<p class="card-actors">Avec : ${escapeHtml(m.actors)}</p>` : "";
    const notes = m.notes ? `<p class="card-notes">${escapeHtml(m.notes)}</p>` : "";

    return `
      <article class="card" data-id="${m.id}">
        <div class="poster-wrap clickable" data-action="detail" title="Voir la fiche">${poster}${badge}${rating}</div>
        <div class="card-body">
          <h3 class="card-title clickable" data-action="detail">${escapeHtml(m.title)}</h3>
          <p class="card-meta">${[
            escapeHtml(m.director),
            m.year,
            m.genre && escapeHtml(m.genre),
            m.runtime && `${m.runtime} min`,
          ].filter(Boolean).join(" · ")}</p>
          ${actors}
          ${notes}
        </div>
        <div class="card-actions">
          <input type="checkbox" class="card-check" data-check="${m.id}"${checked}
            title="Sélectionner pour la mise à jour TMDB">
          <button class="btn sm" data-action="toggle">${
            m.status === "vu" ? "Marquer à voir" : "Marquer vu"
          }</button>
          <span class="spacer"></span>
          <button class="btn sm" data-action="edit">Modifier</button>
          <button class="btn sm danger ghost" data-action="delete">Suppr.</button>
        </div>
      </article>`;
  }

  function render() {
    const grid = $("#grid");
    grid.classList.toggle("list", state.listView);
    const all = visibleMovies();
    const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    state.page = Math.min(state.page, totalPages);
    const movies = all.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
    grid.innerHTML = movies.map(cardHtml).join("");
    $("#empty").classList.toggle("hidden", all.length > 0);

    const pag = $("#pagination");
    pag.classList.toggle("hidden", totalPages <= 1);
    if (totalPages > 1) {
      $("#page-info").textContent = `Page ${state.page} / ${totalPages} — ${all.length} films`;
      $("#page-prev").disabled = state.page === 1;
      $("#page-next").disabled = state.page === totalPages;
      const pageIds = movies.map((m) => m.id);
      $("#sel-page").checked = pageIds.length > 0 && pageIds.every((id) => state.selected.has(id));
    }

    renderStats();
    renderGenreOptions();
    updateSelectionUi();
  }

  /* ---------- Modal ---------- */

  function openModal(movie = null) {
    $("#modal-title").textContent = movie ? "Modifier le film" : "Ajouter un film";
    $("#movie-id").value = movie?.id || "";
    $("#f-title").value = movie?.title || "";
    $("#f-year").value = movie?.year ?? "";
    $("#f-director").value = movie?.director || "";
    $("#f-actors").value = movie?.actors || "";
    $("#f-tmdb-key").value = tmdbKey();
    $("#f-genre").value = movie?.genre || "";
    $("#f-status").value = movie?.status || "à voir";
    $("#f-rating").value = movie?.rating ?? "";
    $("#f-runtime").value = movie?.runtime ?? "";
    $("#f-poster").value = movie?.poster || "";
    $("#f-notes").value = movie?.notes || "";
    $("#modal").classList.remove("hidden");
    $("#f-title").focus();
  }

  function closeModal() {
    $("#modal").classList.add("hidden");
    $("#movie-form").reset();
  }

  /* ---------- Événements ---------- */

  $("#btn-add").addEventListener("click", () => openModal());

  $("#btn-fetch").addEventListener("click", tmdbSearchAndFill);
  $("#tmdb-results").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-tid]");
    if (btn) {
      $("#tmdb-results").classList.add("hidden");
      await fillFromTmdbId(btn.dataset.tid, decodeURIComponent(btn.dataset.key));
    }
  });
  $("#btn-results-close").addEventListener("click", () => {
    $("#tmdb-results").classList.add("hidden");
  });
  $("#tmdb-results").addEventListener("click", (e) => {
    if (e.target === $("#tmdb-results")) $("#tmdb-results").classList.add("hidden");
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFromXml(file);
    e.target.value = "";
  });
  $("#btn-cancel").addEventListener("click", closeModal);
  $("#btn-close").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => {
    if (e.target === $("#modal")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      $("#tmdb-results").classList.add("hidden");
      closeDetail();
    }
  });

  $("#movie-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const num = (v) => (v === "" ? null : Number(v));
    upsertMovie({
      id: $("#movie-id").value || null,
      title: $("#f-title").value.trim(),
      year: num($("#f-year").value),
      director: $("#f-director").value.trim(),
      actors: $("#f-actors").value.trim(),
      genre: $("#f-genre").value.trim(),
      status: $("#f-status").value,
      rating: num($("#f-rating").value),
      runtime: num($("#f-runtime").value),
      poster: $("#f-poster").value.trim(),
      notes: $("#f-notes").value.trim(),
    });
    closeModal();
    render();
  });

  $("#grid").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-check]");
    if (!cb) return;
    if (cb.checked) state.selected.add(cb.dataset.check);
    else state.selected.delete(cb.dataset.check);
    updateSelectionUi();
  });

  $("#btn-tmdb-update").addEventListener("click", tmdbUpdateSelected);

  $("#btn-detail-close").addEventListener("click", closeDetail);
  $("#detail-modal").addEventListener("click", (e) => {
    if (e.target === $("#detail-modal")) closeDetail();
  });
  $("#btn-detail-toggle").addEventListener("click", () => {
    const m = state.movies.find((x) => x.id === detailId);
    if (!m) return;
    m.status = m.status === "vu" ? "à voir" : "vu";
    save();
    render();
    openDetail(detailId);
  });
  $("#btn-detail-edit").addEventListener("click", () => {
    const m = state.movies.find((x) => x.id === detailId);
    if (!m) return;
    closeDetail();
    openModal(m);
  });
  $("#btn-detail-delete").addEventListener("click", () => {
    const m = state.movies.find((x) => x.id === detailId);
    if (!m) return;
    if (confirm(`Supprimer « ${m.title} » de la collection ?`)) {
      closeDetail();
      deleteMovie(m.id);
    }
  });
  $("#btn-progress-cancel").addEventListener("click", () => {
    state.updating = false;
  });

  $("#page-prev").addEventListener("click", () => {
    state.page--;
    render();
    window.scrollTo({ top: 0 });
  });
  $("#page-next").addEventListener("click", () => {
    state.page++;
    render();
    window.scrollTo({ top: 0 });
  });
  $("#sel-page").addEventListener("change", (e) => {
    const all = visibleMovies();
    const pageIds = all.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE).map((m) => m.id);
    pageIds.forEach((id) => e.target.checked ? state.selected.add(id) : state.selected.delete(id));
    render();
  });

  $("#grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const card = btn.closest(".card");
    const movie = state.movies.find((m) => m.id === card.dataset.id);
    if (!movie) return;

    switch (btn.dataset.action) {
      case "delete":
        if (confirm(`Supprimer « ${movie.title} » de la collection ?`)) deleteMovie(movie.id);
        break;
      case "edit":
        openModal(movie);
        break;
      case "detail":
        openDetail(movie.id);
        break;
      case "toggle":
        movie.status = movie.status === "vu" ? "à voir" : "vu";
        save();
        render();
        break;
    }
  });

  $("#search").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    state.page = 1;
    render();
  });
  $("#filter-genre").addEventListener("change", (e) => {
    state.genre = e.target.value;
    state.page = 1;
    render();
  });
  $("#filter-status").addEventListener("change", (e) => {
    state.status = e.target.value;
    state.page = 1;
    render();
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    state.page = 1;
    render();
  });
  $("#list-view").addEventListener("change", (e) => {
    state.listView = e.target.checked;
    render();
  });

  $("#btn-clear").addEventListener("click", () => {
    if (!state.movies.length) return;
    if (confirm("Effacer TOUTE la collection ? Cette action est irréversible.")) {
      state.movies = [];
      state.selected.clear();
      state.page = 1;
      save();
      render();
    }
  });

  render();
})();
