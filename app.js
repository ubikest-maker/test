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
  };

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
    const note = Math.min(10, parseFloat(txt(film, "Note").replace(",", ".")) || 0);
    const duree = parseInt(txt(film, "Duree"), 10) || null;
    const annee = parseInt(txt(film, "Annee"), 10) || null;
    const externId = "filmotech-" + (txt(film, "ID") || encodeURIComponent(txt(film, "TitreVF")));
    const realisateur = (txt(film, "Realisateurs").split("\n")[0] || "").trim();

    return {
      title: txt(film, "TitreVF") || txt(film, "TitreVO") || "Sans titre",
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
      const text = await file.text();
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

  function cardHtml(m) {
    const poster = m.poster
      ? `<img src="${escapeHtml(m.poster)}" alt="Affiche de ${escapeHtml(m.title)}" loading="lazy"
            onerror="this.remove()">`
      : "🎞️";
    const year = m.year ? ` · ${m.year}` : "";
    const runtime = m.runtime ? ` · ${m.runtime} min` : "";
    const rating = m.rating != null ? `<span class="rating-pill">★ ${m.rating}</span>` : "";
    const badge = `<span class="badge ${m.status === "vu" ? "vu" : ""}">${
      m.status === "vu" ? "Vu ✓" : "À voir"
    }</span>`;
    const notes = m.notes ? `<p class="card-notes">${escapeHtml(m.notes)}</p>` : "";

    return `
      <article class="card" data-id="${m.id}">
        <div class="poster-wrap">${poster}${badge}${rating}</div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(m.title)}</h3>
          <p class="card-meta">${[
            escapeHtml(m.director),
            m.year,
            m.genre && escapeHtml(m.genre),
            m.runtime && `${m.runtime} min`,
          ].filter(Boolean).join(" · ")}</p>
          ${notes}
        </div>
        <div class="card-actions">
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
    const movies = visibleMovies();
    grid.innerHTML = movies.map(cardHtml).join("");
    $("#empty").classList.toggle("hidden", movies.length > 0);
    renderStats();
    renderGenreOptions();
  }

  /* ---------- Modal ---------- */

  function openModal(movie = null) {
    $("#modal-title").textContent = movie ? "Modifier le film" : "Ajouter un film";
    $("#movie-id").value = movie?.id || "";
    $("#f-title").value = movie?.title || "";
    $("#f-year").value = movie?.year ?? "";
    $("#f-director").value = movie?.director || "";
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
    if (e.key === "Escape") closeModal();
  });

  $("#movie-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const num = (v) => (v === "" ? null : Number(v));
    upsertMovie({
      id: $("#movie-id").value || null,
      title: $("#f-title").value.trim(),
      year: num($("#f-year").value),
      director: $("#f-director").value.trim(),
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
      case "toggle":
        movie.status = movie.status === "vu" ? "à voir" : "vu";
        save();
        render();
        break;
    }
  });

  $("#search").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    render();
  });
  $("#filter-genre").addEventListener("change", (e) => {
    state.genre = e.target.value;
    render();
  });
  $("#filter-status").addEventListener("change", (e) => {
    state.status = e.target.value;
    render();
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
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
      save();
      render();
    }
  });

  render();
})();
