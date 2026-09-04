/**
 * svara-ui.js
 * ------------------------------------------------------------------
 * Wires up the #diagnostic section markup to SvaraEngine.
 * No physiological measurement happens here — the camera is used only
 * for visual guidance, and every value the engine computes is a
 * traditional expectation, not a diagnosis.
 * ------------------------------------------------------------------
 */

(function () {
  "use strict";

  const root = document.querySelector("[data-svd]");
  if (!root || !window.SvaraEngine) return;

  const steps = {};
  root.querySelectorAll(".svd-step").forEach(function (el) {
    steps[el.dataset.step] = el;
  });

  function showStep(name) {
    Object.keys(steps).forEach(function (key) {
      steps[key].hidden = key !== name;
    });
    steps[name].scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // State carried between steps.
  const state = {
    observedSvara: null,
    cameraStream: null,
    correctionTimer: null,
    observeTimer: null,
  };

  // ------------------------------------------------------------------
  // STEP 1 — camera (guidance only)
  // ------------------------------------------------------------------

  const video = root.querySelector("[data-video]");
  const cameraOff = root.querySelector("[data-camera-off]");
  const cameraStatus = root.querySelector("[data-camera-status]");
  const startBtn = root.querySelector("[data-camera-start]");
  const stopBtn = root.querySelector("[data-camera-stop]");
  const skipBtn = root.querySelector("[data-skip-camera]");

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(function (t) {
        t.stop();
      });
      state.cameraStream = null;
    }
    video.hidden = true;
    cameraOff.hidden = false;
    startBtn.hidden = false;
    stopBtn.hidden = true;
  }

  startBtn.addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraStatus.textContent =
        "This browser doesn't support camera access here. You can continue without it.";
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(function (stream) {
        state.cameraStream = stream;
        video.srcObject = stream;
        video.hidden = false;
        cameraOff.hidden = true;
        startBtn.hidden = true;
        stopBtn.hidden = false;
        cameraStatus.textContent = "";
      })
      .catch(function () {
        cameraStatus.textContent =
          "No problem. You can continue without the camera.";
      });
  });

  stopBtn.addEventListener("click", stopCamera);

  // Continuing keeps the camera running in the background if the user
  // started it and didn't explicitly stop it — it's just guidance, so
  // there's no need to force it off before observation begins.
  skipBtn.addEventListener("click", beginObservation);

  // ------------------------------------------------------------------
  // STEP 2 — breathing observation
  // ------------------------------------------------------------------

  const observeTimerEl = root.querySelector("[data-observe-timer]");
  const toReportBtn = root.querySelector("[data-to-report]");

  function beginObservation() {
    showStep("observe");
    let remaining = 20;
    observeTimerEl.textContent = remaining;
    clearInterval(state.observeTimer);
    state.observeTimer = setInterval(function () {
      remaining -= 1;
      observeTimerEl.textContent = Math.max(remaining, 0);
      if (remaining <= 0) clearInterval(state.observeTimer);
    }, 1000);
  }

  toReportBtn.addEventListener("click", function () {
    clearInterval(state.observeTimer);
    showStep("report");
  });

  // ------------------------------------------------------------------
  // STEP 3 — report
  // ------------------------------------------------------------------

  root.querySelectorAll("[data-report]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.observedSvara = btn.dataset.report;
      prefillContext();
      showStep("context");
    });
  });

  // ------------------------------------------------------------------
  // STEP 4 — date / time / sunrise
  // ------------------------------------------------------------------

  const dateInput = root.querySelector("[data-ctx-date]");
  const timeInput = root.querySelector("[data-ctx-time]");
  const sunriseInput = root.querySelector("[data-ctx-sunrise]");
  const locationBtn = root.querySelector("[data-use-location]");
  const locationStatus = root.querySelector("[data-location-status]");
  const runBtn = root.querySelector("[data-run-assessment]");

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function prefillContext() {
    const now = new Date();
    dateInput.value =
      now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    timeInput.value = pad(now.getHours()) + ":" + pad(now.getMinutes());
    if (!sunriseInput.value) sunriseInput.value = "06:00";
    locationStatus.textContent = "";
  }

  locationBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
      locationStatus.textContent =
        "Location isn't available in this browser — sunrise stays at the value shown.";
      return;
    }
    locationStatus.textContent = "Requesting location…";
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const d = combinedDate();
        const sr = SvaraEngine.approxSunrise(
          d,
          pos.coords.latitude,
          pos.coords.longitude
        );
        sunriseInput.value = pad(sr.time.getHours()) + ":" + pad(sr.time.getMinutes());
        locationStatus.textContent = sr.polarFallback
          ? "Sunrise couldn't be calculated for this latitude/date — using a 6:00am default."
          : "Sunrise estimated from your location (approximate astronomical calculation).";
      },
      function () {
        locationStatus.textContent =
          "Location wasn't shared — sunrise stays at the value shown. You can edit it manually.";
      }
    );
  });

  function combinedDate() {
    const [y, m, d] = dateInput.value.split("-").map(Number);
    const [hh, mm] = timeInput.value.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  function combinedSunrise() {
    const [y, m, d] = dateInput.value.split("-").map(Number);
    const [hh, mm] = sunriseInput.value.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  runBtn.addEventListener("click", function () {
    const result = SvaraEngine.assess({
      date: combinedDate(),
      sunrise: combinedSunrise(),
      observedSvara: state.observedSvara,
      intervalMinutes: 60,
    });
    renderResult(result);
    logEntry(result);
    showStep("result");
  });

  // ------------------------------------------------------------------
  // STEP 5 — result + why panel
  // ------------------------------------------------------------------

  const resultEl = root.querySelector("[data-result]");
  const whyBody = root.querySelector("[data-why-body]");
  const beginCorrectionBtn = root.querySelector("[data-begin-correction]");
  const observeAgainBtn = root.querySelector("[data-observe-again]");

  const SVARA_LABEL = {
    ida: "Ida · Chandra (left)",
    pingala: "Pingala · Surya (right)",
    sushumna: "Sushumna (transition)",
  };

  const STATUS_LABEL = {
    aligned: "Aligned",
    misaligned: "Not aligned",
    transition: "Transition window",
  };

  function renderResult(result) {
    let tattvaRow = "";
    if (result.expectedTattva) {
      tattvaRow =
        '<div class="row"><span>Traditional Tattva</span><b>' +
        result.expectedTattva.tattva.sanskrit +
        " · " +
        result.expectedTattva.tattva.english +
        "</b></div>";
    }

    resultEl.innerHTML =
      '<div class="row"><span>Your observation</span><b>' +
      SVARA_LABEL[result.observedSvara] +
      "</b></div>" +
      '<div class="row"><span>Traditional expectation</span><b>' +
      SVARA_LABEL[result.expectedSvara] +
      "</b></div>" +
      tattvaRow +
      '<span class="status ' +
      result.alignment +
      '">' +
      STATUS_LABEL[result.alignment] +
      "</span>";

    whyBody.innerHTML = result.explanationTrail
      .map(function (item) {
        return (
          '<div class="svd-why-item"><b>' +
          item.label +
          '<span class="svd-why-tag ' +
          item.status +
          '">' +
          (item.status === "source-confirmed" ? "From source" : "Placeholder") +
          "</span></b>" +
          item.value +
          " — " +
          item.note +
          "</div>"
        );
      })
      .join("");

    beginCorrectionBtn.hidden = result.alignment !== "misaligned";
    beginCorrectionBtn.dataset.target = result.expectedSvara;
  }

  observeAgainBtn.addEventListener("click", function () {
    showStep("report");
  });

  // ------------------------------------------------------------------
  // STEP 6 — guided correction (breathing pattern, clearly labeled)
  // ------------------------------------------------------------------

  const correctionTargetEl = root.querySelector("[data-correction-target]");
  const correctionRing = root.querySelector("[data-correction-ring]");
  const correctionPhase = root.querySelector("[data-correction-phase]");
  const endCorrectionBtn = root.querySelector("[data-end-correction]");

  // Gentle, configurable, non-forceful ratio. Not attributed to the
  // source text — see the note rendered alongside it in the markup.
  const BREATH_INHALE_SECONDS = 4;
  const BREATH_EXHALE_SECONDS = 6;

  beginCorrectionBtn.addEventListener("click", function () {
    const target = beginCorrectionBtn.dataset.target;
    correctionTargetEl.textContent =
      "Target: " + SVARA_LABEL[target] + ". Follow the gentle rhythm below.";
    showStep("correction");
    runBreathCycle();
  });

  function runBreathCycle() {
    clearTimeout(state.correctionTimer);
    let phase = "inhale";
    correctionPhase.textContent = "Inhale";
    correctionRing.style.animationDuration = BREATH_INHALE_SECONDS * 2 + "s";

    function tick() {
      phase = phase === "inhale" ? "exhale" : "inhale";
      correctionPhase.textContent = phase === "inhale" ? "Inhale" : "Exhale";
      const seconds =
        phase === "inhale" ? BREATH_INHALE_SECONDS : BREATH_EXHALE_SECONDS;
      state.correctionTimer = setTimeout(tick, seconds * 1000);
    }
    state.correctionTimer = setTimeout(
      tick,
      BREATH_INHALE_SECONDS * 1000
    );
  }

  endCorrectionBtn.addEventListener("click", function () {
    clearTimeout(state.correctionTimer);
    showStep("report");
  });

  // ------------------------------------------------------------------
  // LOG (localStorage only)
  // ------------------------------------------------------------------

  const LOG_KEY = "svaraLog";
  const logList = root.parentElement.querySelector("[data-log-list]");
  const clearLogBtn = root.parentElement.querySelector("[data-clear-log]");

  function readLog() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function writeLog(entries) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(entries));
    } catch (e) {
      /* storage unavailable — log simply won't persist */
    }
  }

  function logEntry(result) {
    const entries = readLog();
    entries.unshift({
      time: new Date().toISOString(),
      observed: result.observedSvara,
      expected: result.expectedSvara,
      alignment: result.alignment,
      tattva: result.expectedTattva ? result.expectedTattva.tattva.sanskrit : null,
    });
    writeLog(entries.slice(0, 200));
    renderLog();
  }

  function renderLog() {
    const entries = readLog();
    if (!entries.length) {
      logList.innerHTML = '<p class="svd-log-empty">No entries yet.</p>';
      return;
    }
    logList.innerHTML = entries
      .map(function (e) {
        const d = new Date(e.time);
        return (
          '<div class="svd-log-item"><span>' +
          pad(d.getHours()) +
          ":" +
          pad(d.getMinutes()) +
          " — observed " +
          e.observed +
          ", expected " +
          e.expected +
          (e.tattva ? ", " + e.tattva : "") +
          "</span><span>" +
          STATUS_LABEL[e.alignment] +
          "</span></div>"
        );
      })
      .join("");
  }

  clearLogBtn.addEventListener("click", function () {
    localStorage.removeItem(LOG_KEY);
    renderLog();
  });

  renderLog();

  // Clean up camera if the user navigates away.
  window.addEventListener("beforeunload", stopCamera);
})();
