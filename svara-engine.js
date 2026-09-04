/**
 * svara-engine.js
 * ------------------------------------------------------------------
 * Transparent rule engine for the Svara Yoga self-observation tool.
 *
 * DESIGN PRINCIPLE: every rule below carries a `status` field:
 *
 *   "source-confirmed"  — taken directly from the text excerpt the
 *                          site owner supplied. Safe to present as
 *                          "the tradition states X".
 *
 *   "placeholder"        — NOT found in the supplied excerpt. A
 *                          commonly-cited convention is used as a
 *                          reasonable default so the tool functions,
 *                          but it is clearly labelled as unverified
 *                          in the UI and should be replaced once the
 *                          full source text is available.
 *
 * Nothing here claims a specific verse number. Verse citations
 * should only be added once someone has checked them against the
 * actual page/verse of the source text — the engine intentionally
 * leaves `verse: null` everywhere rather than inventing one.
 *
 * This file performs NO physiological measurement. It only compares
 * a self-reported observation against a traditional expectation.
 * ------------------------------------------------------------------
 */

(function (global) {
  "use strict";

  // ------------------------------------------------------------------
  // 1. TATTVA SEQUENCE  (source-confirmed order, placeholder durations)
  // ------------------------------------------------------------------

  const TATTVA_SEQUENCE = [
    { id: "vayu", sanskrit: "Vayu", english: "Air", symbol: "vayu" },
    { id: "agni", sanskrit: "Agni", english: "Fire", symbol: "agni" },
    { id: "prithvi", sanskrit: "Prithvi", english: "Earth", symbol: "prithvi" },
    { id: "jala", sanskrit: "Jala", english: "Water", symbol: "jala" },
    { id: "akasha", sanskrit: "Akasha", english: "Space", symbol: "akasha" },
  ];

  const TATTVA_RULE_META = {
    status: "source-confirmed",
    note:
      "The supplied source states this sequence (Vayu, Agni, Prithvi, Jala, " +
      "Akasha) recurs during the flow of each nadi.",
    verse: null,
  };

  // How long each Tattva lasts within one nadi's active period is NOT
  // specified in the excerpt supplied so far. We split the active
  // period into five equal parts as a functional placeholder only.
  const TATTVA_DURATION_META = {
    status: "placeholder",
    note:
      "NOT SPECIFIED IN SOURCE. Equal five-way division is used only so " +
      "the tool can display something; replace with the source's exact " +
      "timing once available.",
    verse: null,
  };

  function expectedTattva(minutesSinceNadiStart, nadiActiveDurationMinutes) {
    const slice = nadiActiveDurationMinutes / TATTVA_SEQUENCE.length;
    const idx = Math.min(
      TATTVA_SEQUENCE.length - 1,
      Math.max(0, Math.floor(minutesSinceNadiStart / slice))
    );
    return {
      tattva: TATTVA_SEQUENCE[idx],
      index: idx,
      meta: TATTVA_DURATION_META,
      sequenceMeta: TATTVA_RULE_META,
    };
  }

  // ------------------------------------------------------------------
  // 2. LUNAR DAY (TITHI) — simplified astronomical approximation
  // ------------------------------------------------------------------
  // This is a standard synodic-month approximation, NOT a verified
  // panchang. It is good enough to place a date within roughly a day
  // of the correct tithi, not precise enough for ritual timing.

  const SYNODIC_MONTH_DAYS = 29.530588853;
  // A known new moon reference (2000-01-06 18:14 UTC).
  const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);

  const TITHI_META = {
    status: "placeholder",
    note:
      "Approximate astronomical calculation, not a verified panchang. " +
      "Do not rely on this for religious timing.",
    verse: null,
  };

  function lunarInfo(date) {
    const daysSinceKnownNewMoon =
      (date.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
    const age = daysSinceKnownNewMoon % SYNODIC_MONTH_DAYS;
    const ageNormalized = age < 0 ? age + SYNODIC_MONTH_DAYS : age;

    // Each tithi spans 1/30th of the synodic month, starting at new moon.
    const tithiIndex = Math.floor(ageNormalized / (SYNODIC_MONTH_DAYS / 30));
    const tithiNumber = tithiIndex + 1; // 1..30

    const paksha = tithiNumber <= 15 ? "shukla" : "krishna";
    const tithiInPaksha = paksha === "shukla" ? tithiNumber : tithiNumber - 15;

    return {
      moonAgeDays: ageNormalized,
      tithiNumber,
      paksha, // "shukla" (waxing) | "krishna" (waning)
      tithiInPaksha, // 1..15
      isPratipada: tithiInPaksha === 1,
      meta: TITHI_META,
    };
  }

  // ------------------------------------------------------------------
  // 3. PRATIPADA STARTING SVARA — source-confirmed
  // ------------------------------------------------------------------

  const PRATIPADA_RULE_META = {
    status: "source-confirmed",
    note:
      "The supplied source states Ida is prescribed at Pratipada (day 1) " +
      "of Shukla Paksha, and Pingala at Pratipada of Krishna Paksha.",
    verse: null,
  };

  function startingSvaraAtPratipada(paksha) {
    return paksha === "shukla" ? "ida" : "pingala";
  }

  // ------------------------------------------------------------------
  // 4. EXPECTED SVARA FOR THE CURRENT DAY — placeholder extension
  // ------------------------------------------------------------------
  // The excerpt supplied only fixes the swara on Pratipada itself. The
  // common convention of alternating the "starting swara" on each
  // successive tithi is NOT confirmed in the excerpt, so it is flagged.

  const DAILY_ALTERNATION_META = {
    status: "placeholder",
    note:
      "NOT SPECIFIED IN SOURCE beyond Pratipada. Alternating the day's " +
      "starting swara on each successive tithi is a common convention " +
      "in secondary literature, applied here only as a placeholder.",
    verse: null,
  };

  function startingSvaraForTithi(paksha, tithiInPaksha) {
    const pratipadaSvara = startingSvaraAtPratipada(paksha);
    const alternate = (tithiInPaksha - 1) % 2 === 0;
    return alternate ? pratipadaSvara : oppositeSvara(pratipadaSvara);
  }

  function oppositeSvara(svara) {
    return svara === "ida" ? "pingala" : "ida";
  }

  // ------------------------------------------------------------------
  // 5. HOURLY ALTERNATION SINCE SUNRISE — placeholder interval
  // ------------------------------------------------------------------

  const ALTERNATION_META = {
    status: "placeholder",
    note:
      "The commonly-cited approximate alternation interval (about 60 " +
      "minutes) is used as a configurable default. Replace with the " +
      "source's exact figure if it specifies one.",
    verse: null,
  };

  /**
   * @param {Date} now
   * @param {Date} sunrise  - today's sunrise, as a Date
   * @param {"ida"|"pingala"} startingSvara - swara active at sunrise
   * @param {number} intervalMinutes - alternation interval (default 60)
   */
  function expectedSvaraNow(now, sunrise, startingSvara, intervalMinutes) {
    const interval = intervalMinutes || 60;
    let minutesSinceSunrise = (now.getTime() - sunrise.getTime()) / 60000;

    // If "now" is before today's sunrise, treat it as still within
    // yesterday's cycle rather than producing a negative index.
    if (minutesSinceSunrise < 0) minutesSinceSunrise += 24 * 60;

    const periodsElapsed = Math.floor(minutesSinceSunrise / interval);
    const minutesIntoCurrentPeriod = minutesSinceSunrise % interval;

    const svara =
      periodsElapsed % 2 === 0 ? startingSvara : oppositeSvara(startingSvara);

    // Treat the last couple of minutes before a switch as a brief
    // Sushumna / transition window, per the source's description of
    // the changeover between nadis.
    const transitionWindowMinutes = Math.min(2, interval * 0.05);
    const inTransition =
      minutesIntoCurrentPeriod >= interval - transitionWindowMinutes;

    return {
      svara: inTransition ? "sushumna" : svara,
      underlyingSvara: svara,
      minutesIntoCurrentPeriod,
      intervalMinutes: interval,
      meta: ALTERNATION_META,
    };
  }

  // ------------------------------------------------------------------
  // 5b. SUNRISE — standard astronomical approximation (not tradition-specific)
  // ------------------------------------------------------------------
  // This is an ordinary sunrise formula (NOAA-style), included only so the
  // tool has a default reference point when no sunrise is entered manually.
  // It carries no traditional-source claim at all — it is plain astronomy.

  function approxSunrise(date, latitude, longitude) {
    const zenith = 90.833; // official sunrise zenith, incl. atmospheric refraction
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;

    const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const dayOfYear = Math.floor((start - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);

    const lngHour = longitude / 15;
    const t = dayOfYear + (6 - lngHour) / 24;

    const M = 0.9856 * t - 3.289;
    let L =
      M +
      1.916 * Math.sin(M * rad) +
      0.020 * Math.sin(2 * M * rad) +
      282.634;
    L = ((L % 360) + 360) % 360;

    let RA = deg * Math.atan(0.91764 * Math.tan(L * rad));
    RA = ((RA % 360) + 360) % 360;
    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = RA + (Lquadrant - RAquadrant);
    RA = RA / 15;

    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));

    const cosH =
      (Math.cos(zenith * rad) - sinDec * Math.sin(latitude * rad)) /
      (cosDec * Math.cos(latitude * rad));

    if (cosH > 1 || cosH < -1) {
      // Sun never rises/sets at this latitude on this day — fall back
      // to a plain 06:00 local default rather than failing.
      const fallback = new Date(date);
      fallback.setHours(6, 0, 0, 0);
      return { time: fallback, polarFallback: true };
    }

    const H = (360 - deg * Math.acos(cosH)) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    let UT = T - lngHour;
    UT = ((UT % 24) + 24) % 24;

    const sunriseUTC = new Date(start + UT * 3600000);
    return { time: sunriseUTC, polarFallback: false };
  }

  // ------------------------------------------------------------------
  // 6. FULL ASSESSMENT
  // ------------------------------------------------------------------

  /**
   * @param {Object} input
   * @param {Date}   input.date
   * @param {Date}   input.sunrise
   * @param {"ida"|"pingala"|"sushumna"} input.observedSvara
   * @param {number} [input.intervalMinutes]
   */
  function assess(input) {
    const { date, sunrise, observedSvara } = input;
    const intervalMinutes = input.intervalMinutes || 60;

    const lunar = lunarInfo(date);
    const startingSvara = startingSvaraForTithi(
      lunar.paksha,
      lunar.tithiInPaksha
    );

    const alternation = expectedSvaraNow(
      date,
      sunrise,
      startingSvara,
      intervalMinutes
    );

    const tattva =
      alternation.svara === "sushumna"
        ? null
        : expectedTattva(alternation.minutesIntoCurrentPeriod, intervalMinutes);

    let alignment;
    if (observedSvara === "sushumna" || alternation.svara === "sushumna") {
      alignment =
        observedSvara === alternation.svara ? "aligned" : "transition";
    } else {
      alignment = observedSvara === alternation.svara ? "aligned" : "misaligned";
    }

    return {
      observedSvara,
      expectedSvara: alternation.svara,
      alignment, // "aligned" | "misaligned" | "transition"
      expectedTattva: tattva,
      lunar,
      startingSvaraForToday: {
        svara: startingSvara,
        pratipadaMeta: PRATIPADA_RULE_META,
        dailyAlternationMeta: DAILY_ALTERNATION_META,
      },
      alternationMeta: alternation.meta,
      // A single, readable "why" trail assembled from the rule metadata
      // above rather than a free-text explanation, so the UI can render
      // it directly without re-deriving anything.
      explanationTrail: [
        {
          label: "Lunar day (tithi)",
          value:
            lunar.paksha.charAt(0).toUpperCase() +
            lunar.paksha.slice(1) +
            " Paksha, tithi " +
            lunar.tithiInPaksha,
          status: lunar.meta.status,
          note: lunar.meta.note,
        },
        {
          label: "Starting swara at Pratipada",
          value: startingSvaraAtPratipada(lunar.paksha),
          status: PRATIPADA_RULE_META.status,
          note: PRATIPADA_RULE_META.note,
        },
        {
          label: "Starting swara today",
          value: startingSvara,
          status: DAILY_ALTERNATION_META.status,
          note: DAILY_ALTERNATION_META.note,
        },
        {
          label: "Alternation since sunrise",
          value: intervalMinutes + " minute interval (configurable)",
          status: ALTERNATION_META.status,
          note: ALTERNATION_META.note,
        },
        tattva && {
          label: "Tattva sequence position",
          value: tattva.tattva.sanskrit + " (" + tattva.tattva.english + ")",
          status: TATTVA_DURATION_META.status,
          note: TATTVA_DURATION_META.note,
        },
      ].filter(Boolean),
    };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  global.SvaraEngine = {
    TATTVA_SEQUENCE,
    lunarInfo,
    startingSvaraAtPratipada,
    startingSvaraForTithi,
    expectedSvaraNow,
    expectedTattva,
    oppositeSvara,
    approxSunrise,
    assess,
  };
})(window);
