(function() {
  "use strict";

  let cData = null;
  let hasSpun = false;
  let userClosed = false;
  let impLogged = false;

  function getStorage(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  function setStorage(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  function removeStorage(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  }

  function getSessionHash() {
    try {
      let s = sessionStorage.getItem("cs_session_hash");
      if (!s) {
        s = "cs_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
        sessionStorage.setItem("cs_session_hash", s);
      }
      return s;
    } catch (e) {
      return "cs_h";
    }
  }

  function init() {
    let r = document.getElementById("convert-spin-root");
    if (!r) {
      r = document.createElement("div");
      r.id = "convert-spin-root";
      document.body.appendChild(r);
    }

    const s = r.getAttribute("data-shop") || window.location.hostname;
    const c = parseFloat(r.getAttribute("data-cart-total") || "0");
    const pb = `${window.location.origin}/apps/convert-spin`;
    const url = `${pb}/campaign?shop=${encodeURIComponent(s)}`;
    const sHash = getSessionHash();

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.campaign) return;
        cData = data.campaign;
        if (data.shopDomain) {
          cData.shopDomain = data.shopDomain;
        }
        start(r, s, c, pb, sHash);
      })
      .catch((err) => console.error("[CS] Init error:", err));
  }

  function start(r, s, c, apiBase, sHash) {
    if (!cData) return;
    const { id, triggers: trg, themeSettings: thm, segments: seg } = cData;

    const lockStr = getStorage(`cs_claimed_time_${id}`);
    if (lockStr) {
      const exp = parseInt(lockStr, 10);
      if (!isNaN(exp) && Date.now() < exp) {
        hasSpun = true;
      } else {
        removeStorage(`cs_claimed_time_${id}`);
        hasSpun = false;
      }
    }

    if (trg && trg.cartValueMin && c < trg.cartValueMin) return;

    renderDom(r, thm || {}, seg || []);

    if (cData.type === "EMBED" || r.getAttribute("data-mode") === "inline" || hasSpun) return;

    const delay = trg && typeof trg.timeDelay === "number" ? Math.max(5, trg.timeDelay) : 5;
    setTimeout(() => {
      if (!hasSpun && !userClosed) showPopup(s, apiBase, sHash);
    }, delay * 1000);

    if (trg && trg.exitIntent && !hasSpun) {
      document.addEventListener("mouseleave", (e) => {
        if (e.clientY <= 10 && !hasSpun && !userClosed) showPopup(s, apiBase, sHash);
      });
    }

    if (trg && trg.scrollDepth && trg.scrollDepth > 0 && !hasSpun) {
      window.addEventListener("scroll", () => {
        if (hasSpun || userClosed) return;
        const st = window.scrollY || document.documentElement.scrollTop;
        const dh = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        if (dh > 0 && (st / dh) * 100 >= (trg.scrollDepth || 50)) {
          showPopup(s, apiBase, sHash);
        }
      });
    }
  }

  function showPopup(s, apiBase, sHash) {
    const o = document.getElementById("cs-overlay");
    if (!o || hasSpun || userClosed) return;
    o.classList.add("cs-active");

    if (!impLogged && cData) {
      impLogged = true;
      const targetShop = cData.shopDomain || s;
      const p = JSON.stringify({ shopDomain: targetShop, campaignId: cData.id, sessionHash: sHash });
      const ep = `${apiBase}/impression`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ep, p);
      } else {
        fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: p,
        }).catch(() => {});
      }
    }
  }

  function hidePopup(e) {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    const o = document.getElementById("cs-overlay");
    if (o) o.classList.remove("cs-active");
    userClosed = true;
  }

  function renderDom(r, thm, seg) {
    const pCol = thm.primaryColor || "#4F46E5";
    const defaultBtnText = thm.buttonText || "Spin The Wheel Now";

    if (cData.type === "EMBED" || r.getAttribute("data-mode") === "inline") {
      r.innerHTML = `
        <div class="cs-inline-card" style="display:flex;flex-wrap:wrap;gap:24px;background:${thm.backgroundColor || '#FFF'};padding:30px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);align-items:center;justify-content:center;max-width:850px;margin:20px auto;">
          <div class="cs-wheel-wrapper" style="position:relative;width:300px;height:300px;">
            <div class="cs-pointer-pin"></div>
            <div style="width:100%;height:100%;">${buildSvg(seg, pCol)}</div>
          </div>
          <div class="cs-content-col" id="cs-content-col" style="flex:1;min-width:280px;">
            <h2 class="cs-title" style="color:${thm.textColor || "#0F172A"};font-size:24px;margin-bottom:8px;">${esc(thm.title || "Spin & Win!")}</h2>
            <p class="cs-subtitle" style="margin-bottom:16px;">${esc(thm.subtitle || "Enter email to win an exclusive prize.")}</p>
            <div id="cs-error-msg" style="display:none;color:#DC2626;font-size:13px;margin-bottom:10px;"></div>
            <form id="cs-spin-form" class="cs-form-group">
              <input type="email" id="cs-email-input" class="cs-input" placeholder="Enter email address" required />
              ${thm.requirePhone ? '<input type="tel" id="cs-phone-input" class="cs-input" placeholder="Enter phone" required />' : ""}
              <label class="cs-consent-label">
                <input type="checkbox" id="cs-gdpr-check" required checked />
                <span>${esc(thm.gdprNotice || "I agree to marketing updates.")}</span>
              </label>
              <button type="submit" id="cs-spin-submit" class="cs-spin-btn" style="background:${pCol}">${esc(defaultBtnText)}</button>
            </form>
          </div>
        </div>`;
      document.getElementById("cs-spin-form").addEventListener("submit", onSpin);
      return;
    }

    const isSlide = cData.type === "SLIDE_IN" || cData.type === "SLIDEIN";
    const ovCls = isSlide ? "cs-slidein-overlay" : "cs-popup-overlay";
    const cardCls = isSlide ? "cs-slidein-card" : "cs-modal-card";
    const iconSvg = thm.launcherSvg
      ? `<span style="display:inline-flex;align-items:center;width:20px;height:20px;margin-right:6px;">${thm.launcherSvg}</span>`
      : "";
    const launchStyle = hasSpun ? `background:${pCol};display:none !important;` : `background:${pCol};`;

    r.innerHTML = `
      <div id="cs-overlay" class="${ovCls}">
        <div class="${cardCls}">
          <button id="cs-close-btn" type="button" class="cs-close-btn" title="Close">&times;</button>
          <div class="cs-wheel-wrapper">
            <div class="cs-pointer-pin"></div>
            <div style="width:100%;height:100%;">${buildSvg(seg, pCol)}</div>
          </div>
          <div class="cs-content-col" id="cs-content-col">
            <h2 class="cs-title" style="color:${thm.textColor || "#0F172A"}">${esc(thm.title || "Spin & Win!")}</h2>
            <p class="cs-subtitle">${esc(thm.subtitle || "Enter email to win an exclusive prize.")}</p>
            <div id="cs-error-msg" style="display:none;color:#DC2626;font-size:13px;margin-bottom:10px;"></div>
            <form id="cs-spin-form" class="cs-form-group">
              <input type="email" id="cs-email-input" class="cs-input" placeholder="Enter email address" required />
              ${thm.requirePhone ? '<input type="tel" id="cs-phone-input" class="cs-input" placeholder="Enter phone" required />' : ""}
              <label class="cs-consent-label">
                <input type="checkbox" id="cs-gdpr-check" required checked />
                <span>${esc(thm.gdprNotice || "I agree to marketing updates.")}</span>
              </label>
              <button type="submit" id="cs-spin-submit" class="cs-spin-btn" style="background:${pCol}">${esc(defaultBtnText)}</button>
            </form>
          </div>
        </div>
      </div>
      <button id="cs-launcher-btn" type="button" class="cs-launcher-btn" style="${launchStyle}">${iconSvg}${esc(thm.floatingLauncherText || "🎁 Spin to Win!")}</button>`;

    const cBtn = document.getElementById("cs-close-btn");
    if (cBtn) cBtn.addEventListener("click", hidePopup);

    const ovEl = document.getElementById("cs-overlay");
    if (ovEl) {
      ovEl.addEventListener("click", (e) => {
        if (e.target === ovEl) hidePopup(e);
      });
    }

    document.getElementById("cs-launcher-btn").addEventListener("click", () => {
      showPopup(cData ? cData.shopDomain : window.location.hostname, `${window.location.origin}/apps/convert-spin`, getSessionHash());
    });

    document.getElementById("cs-spin-form").addEventListener("submit", onSpin);
  }

  function buildSvg(seg, pCol) {
    if (!seg || !seg.length) return "";
    const n = seg.length;
    const sa = 360 / n;
    const r = 140;
    const c = 150;
    let p = "";

    seg.forEach((g, i) => {
      const sDeg = i * sa - 90;
      const eDeg = (i + 1) * sa - 90;
      const sRad = (sDeg * Math.PI) / 180;
      const eRad = (eDeg * Math.PI) / 180;
      const x1 = c + r * Math.cos(sRad);
      const y1 = c + r * Math.sin(sRad);
      const x2 = c + r * Math.cos(eRad);
      const y2 = c + r * Math.sin(eRad);
      const lArc = sa > 180 ? 1 : 0;
      const pData = `M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${lArc} 1 ${x2} ${y2} Z`;
      const tAng = sDeg + sa / 2;
      const tX = c + r * 0.65 * Math.cos((tAng * Math.PI) / 180);
      const tY = c + r * 0.65 * Math.sin((tAng * Math.PI) / 180);
      p += `<path d="${pData}" fill="${g.hexColor || "#3B82F6"}" stroke="#FFF" stroke-width="2"/><text x="${tX}" y="${tY}" fill="#FFF" font-size="12" font-weight="bold" text-anchor="middle" dominant-baseline="middle" transform="rotate(${tAng + 90},${tX},${tY})">${esc(g.label)}</text>`;
    });

    return `
      <svg class="cs-svg-wheel" id="cs-svg-wheel" viewBox="0 0 300 300">
        <circle cx="${c}" cy="${c}" r="${r + 4}" fill="#0F172A" stroke="#F59E0B" stroke-width="5" />
        <g>${p}</g>
        <circle cx="${c}" cy="${c}" r="24" fill="#FFF" stroke="${pCol}" stroke-width="4"/>
        <text x="${c}" y="${c}" fill="${pCol}" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="middle">SPIN</text>
      </svg>`;
  }

  function onSpin(e) {
    e.preventDefault();
    if (hasSpun || !cData) return;

    const eIn = document.getElementById("cs-email-input");
    const pIn = document.getElementById("cs-phone-input");
    const btn = document.getElementById("cs-spin-submit");
    const errBox = document.getElementById("cs-error-msg");
    const origBtnText = (cData.themeSettings && cData.themeSettings.buttonText) || "Spin The Wheel Now";

    if (errBox) {
      errBox.style.display = "none";
      errBox.innerText = "";
    }

    btn.disabled = true;
    btn.innerText = "Spinning...";

    const s = cData.shopDomain || (document.getElementById("convert-spin-root")?.getAttribute("data-shop")) || window.location.hostname;
    const ep = `${window.location.origin}/apps/convert-spin/spin`;

    fetch(ep, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopDomain: s,
        campaignId: cData.id,
        email: eIn ? eIn.value : "",
        phone: pIn ? pIn.value : "",
        sessionHash: getSessionHash(),
        deviceType: window.innerWidth < 768 ? "mobile" : "desktop",
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res || !res.success) {
          const errMsg = (res && res.error) || "Unable to spin right now. Please try again.";
          if (errBox) {
            errBox.innerText = errMsg;
            errBox.style.display = "block";
          } else {
            alert(errMsg);
          }
          btn.disabled = false;
          btn.innerText = origBtnText;
          return;
        }

        hasSpun = true;
        const lBtn = document.getElementById("cs-launcher-btn");
        if (lBtn) lBtn.style.display = "none";

        const mins = cData.triggers && typeof cData.triggers.recurrenceInterval === "number"
          ? cData.triggers.recurrenceInterval
          : 15;
        setStorage(`cs_claimed_time_${cData.id}`, (Date.now() + mins * 6e4).toString());

        const wSvg = document.getElementById("cs-svg-wheel");
        if (wSvg && typeof res.winningIndex === "number" && cData.segments) {
          const sa = 360 / cData.segments.length;
          const sc = res.winningIndex * sa + sa / 2;
          wSvg.style.transform = `rotate(${1800 + (360 - sc)}deg)`;
        }

        setTimeout(() => renderWin(res), 4500);
      })
      .catch((err) => {
        console.error("[CS] Spin error", err);
        if (errBox) {
          errBox.innerText = "Network error. Please try again.";
          errBox.style.display = "block";
        }
        btn.disabled = false;
        btn.innerText = origBtnText;
      });
  }

  function renderWin(res) {
    const col = document.getElementById("cs-content-col");
    if (!col) return;

    const isLoss = res.discountType === "TRY_AGAIN" || !res.discountCode;
    if (isLoss) {
      col.innerHTML = `
        <div class="cs-win-card">
          <h2 class="cs-title">Better Luck Next Time!</h2>
          <p class="cs-subtitle">Thank you for playing!</p>
        </div>`;
    } else {
      col.innerHTML = `
        <div class="cs-win-card">
          <h2 class="cs-title">🎉 Congratulations!</h2>
          <p class="cs-subtitle">You won: <strong>${esc(res.segmentLabel)}</strong></p>
          <div class="cs-win-code-box" id="cs-code-text">${esc(res.discountCode)}</div>
          <button class="cs-copy-btn" id="cs-copy-btn">Copy & Apply Discount</button>
        </div>`;

      document.getElementById("cs-copy-btn").addEventListener("click", () => {
        try {
          navigator.clipboard.writeText(res.discountCode);
        } catch (e) {}
        document.getElementById("cs-copy-btn").innerText = "✓ Copied!";
        window.location.href = `/discount/${encodeURIComponent(res.discountCode)}`;
      });
    }
  }

  function esc(s) {
    return s
      ? String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      : "";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
