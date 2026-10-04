(() => {
  "use strict";

  const SUPABASE_URL = "https://vwulrywvwjevwtgizpnp.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Fy43I5bt16aGjlCL-JRvXA_Jp6u_9rz";
  const TABLE = "shows";

  const list = document.getElementById("shows-list");
  const emptyState = document.getElementById("shows-empty");
  const errorState = document.getElementById("shows-error");

  if (!list || !emptyState || !errorState) return;

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  };

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  function localToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateOnly(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(value) {
    const date = parseDateOnly(value);
    return {
      month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: String(date.getDate()).padStart(2, "0"),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
    };
  }

  function formatTime(value) {
    if (!value) return "TBD";
    const [hourRaw, minuteRaw] = value.split(":");
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw || 0);
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function venueMarkup(show) {
    const name = escapeHtml(show.venue);
    if (!show.venue_url) return `<strong>${name}</strong>`;
    return `<a href="${escapeHtml(show.venue_url)}" target="_blank" rel="noopener"><strong>${name}</strong><span aria-hidden="true">↗</span></a>`;
  }

  function actionMarkup(show) {
    const url = show.ticket_url || show.venue_url;
    if (!url) return `<span class="show-row-arrow" aria-hidden="true">↗</span>`;
    return `<a class="show-row-arrow" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="Open event or venue details">↗</a>`;
  }

  function renderShow(show) {
    const date = formatDate(show.event_date);
    const location = [show.city, show.region].filter(Boolean).map(escapeHtml).join(", ");
    const details = show.details ? `<p class="show-row-details">${escapeHtml(show.details)}</p>` : "";

    return `
      <article class="show-row">
        <div class="show-row-date" aria-label="${date.weekday} ${date.month} ${date.day}">
          <span>${date.weekday}</span>
          <strong>${date.day}</strong>
          <b>${date.month}</b>
        </div>

        <div class="show-row-venue">
          ${venueMarkup(show)}
          ${details}
        </div>

        <div class="show-row-location">${location || "—"}</div>

        <div class="show-row-time">${formatTime(show.start_time)}</div>

        ${actionMarkup(show)}
      </article>
    `;
  }

  async function loadShows() {
    const today = localToday();
    const query =
      `?select=id,event_date,start_time,venue,city,region,venue_url,ticket_url,details` +
      `&published=eq.true` +
      `&event_date=gte.${encodeURIComponent(today)}` +
      `&order=event_date.asc,start_time.asc.nullslast`;

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}${query}`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`Shows request failed (${response.status})`);
      }

      const shows = await response.json();

      if (!shows.length) {
        list.innerHTML = "";
        emptyState.hidden = false;
        errorState.hidden = true;
        return;
      }

      list.innerHTML = shows.map(renderShow).join("");
      emptyState.hidden = true;
      errorState.hidden = true;
    } catch (error) {
      console.error(error);
      list.innerHTML = "";
      emptyState.hidden = true;
      errorState.hidden = false;
    }
  }

  loadShows();
})();