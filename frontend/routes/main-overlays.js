// Overlay, onboarding, and walker animation controllers.
// Loaded after script.js because it depends on runtime setup above.

/* Whats New popup */
(function(){
  var DEFAULT_KEY = 'silkroad_whatsnew_v17';

  function getKey() { return window._wnKey || DEFAULT_KEY; }

  window.showWhatsNew = function(){
    if (localStorage.getItem(getKey()) === '1') return;
    var modal = document.getElementById('whatsNewModal');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ modal.classList.add('is-visible'); });
    });
  };

  window.closeWhatsNew = function(){
    var modal = document.getElementById('whatsNewModal');
    var cb    = document.getElementById('whatsNewDontShow');
    if (cb && cb.checked) localStorage.setItem(getKey(), '1');
    if (!modal) return;
    modal.classList.remove('is-visible');
    setTimeout(function(){ modal.style.display = 'none'; }, 380);
  };
})();

/* Onboarding tour */
(function(){
  const TOUR_OFF_KEY  = 'silkroad_tour_off';
  const TOUR_SEEN_KEY = 'silkroad_tour_seen_v15';

  const $  = function(s){ return document.querySelector(s); };
  const $$ = function(s){ return Array.from(document.querySelectorAll(s)); };
  const isMobile = function(){ return window.innerWidth <= 768; };
  const sleep    = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

  /* Step definitions */
  /* Each step:
       title       — heading
       text        — desktop body (HTML allowed)
       textMobile  — optional mobile body
       target      — CSS selector to highlight (desktop)
       targetMobile— optional mobile selector
       side        — 'top'|'bottom'|'left'|'right' (preferred card side)
       tab         — 'routes'|'prices'|'tools'|'events'|'settings'|'about'
       beforeShow  — async function to run before highlighting
       afterShow   — async function to run after highlight is placed
       afterLeave  — function to run when leaving this step
       tryLabel    — text for "Try this" callout (enables interactive gate)
       waitFor     — function returning truthy when "try" is satisfied (Next becomes enabled)
       waitEvent   — event name + selector to listen on for the gate
       autoNext    - auto-advance after waitFor satisfied (ms delay)
  */
  const STEPS = [
    {
      title:'Welcome, traveler',
      text:'<p>This is the <em>Silk Road Trading Calculator</em>. It finds the best places to buy and sell goods in the game.</p><p>This short tour shows you every part of the site and lets you try things hands-on. Takes about <strong>three minutes</strong>. You can leave any time.</p>',
      target:null,
    },
    {
      title:'Your Merchant Setup',
      text:'<p>Everything starts here. Pick your <em>culture</em>, <em>religion</em>, <em>language skill</em>, <em>animals</em>, and <em>storage</em>.</p><p>The numbers in the routes table change right away when you change these.</p>',
      textMobile:'<p>Tap the <em>Merchant Setup</em> bar at the top of your screen to open it.</p><p>Pick your culture, religion, language, animals and storage. The route cards update right away.</p>',
      target:'#sidebar',
      targetMobile:'#sidebarToggle',
      side:'right',
      beforeShow:function(){
        if (isMobile() && document.body.dataset.sidebar === 'collapsed'){
          var btn = $('#sidebarToggle'); if (btn) btn.click();
        }
      },
    },
    {
      title:'Try changing your religion',
      text:'<p>Pick a different <em>Religion</em> from the dropdown and watch the route prices update right away.</p><p>Each religion changes which goods you make extra profit on. Christianity helps in big cities. Zoroastrianism helps with metals and crafts.</p>',
      textMobile:'<p>Pick a different <em>Religion</em> from the dropdown and watch the route prices update right away.</p>',
      target:'#religion',
      targetMobile:'#religion',
      side:'right',
      tryLabel:'Change your religion',
      tryLabelMobile:'Change your religion',
      waitEvent:{ selector:'#religion', event:'change' },
      beforeShow:function(){
        if (isMobile() && document.body.dataset.sidebar === 'collapsed'){
          var btn = $('#sidebarToggle'); if (btn) btn.click();
        }
      },
    },
    {
      title:'The Sections',
      text:'<p>These tabs are the main parts of the calculator. We will visit each one.</p>',
      target:'#tabsRow',
      side:'bottom',
      beforeShow:function(){
        if (isMobile() && document.body.dataset.sidebar !== 'collapsed'){
          var btn = $('#sidebarToggle'); if (btn) btn.click();
        }
      },
    },
    {
      title:'Trading Routes',
      text:'<p>This is the main table. Every good trade between cities is listed here. The best <em>profit per minute</em> is on top.</p><p>Each row shows where to <em>buy</em>, the <em>good</em>, where to <em>sell</em>, the <em>price</em> on each side, the <em>travel time</em>, and the <em>profit</em>.</p>',
      textMobile:'<p>These cards show every good trade between cities. The best <em>profit per minute</em> is on top.</p><p>Each card has the buy city, the good, the sell city, the profit per unit, and the travel time.</p>',
      target:'#routeTable',
      targetMobile:'#routeCards',
      side:'top',
    },
    {
      title:'Sort and Filter',
      text:'<p>Use these to sort and filter the table.</p><p>Switch <em>Sort by</em> to <em>Profit per Trip</em> to see which single runs earn the most. Use the <em>Type</em> chips to show only one kind of cargo.</p>',
      target:'#toolbar',
      side:'bottom',
      tryLabel:'Change "Sort by" to anything',
      waitEvent:{ selector:'#sortBy', event:'change' },
      beforeShow:async function(){
        $$('.expand-row.open').forEach(function(r){ r.classList.remove('open'); });
        $$('.row-expanded').forEach(function(r){ r.classList.remove('row-expanded'); });
        $$('.route-card.card-open').forEach(function(c){ c.classList.remove('card-open'); });
      },
    },
    {
      title:'Return Cargo',
      text:'<p>Click any row to see the best cargo for the trip <em>back home</em>.</p><p>The opened row shows the return leg with its own profit. Try clicking the top row now.</p>',
      textMobile:'<p>Tap any card to see the best cargo for the trip <em>back home</em>.</p><p>The opened card shows the return leg with its own profit. Try tapping the top card now.</p>',
      target:'#routeTable tbody tr:not(.expand-row)',
      targetMobile:'.route-card',
      side:'top',
      tryLabel:'Click the top route to expand it',
      tryLabelMobile:'Tap the top card to expand it',
      waitFor:function(){
        return !!document.querySelector('.row-expanded') ||
               !!document.querySelector('.route-card.card-open');
      },
      waitEvent:{ selector:'#routeTable, #routeCards', event:'click' },
      onSatisfied:function(){
        // Once the user expands a row, grow the spotlight to include the
        // expanded return-leg sibling (or the open card content) so they
        // can actually see what they revealed.
        setTimeout(function(){
          const expandedRow = document.querySelector('tr.row-expanded');
          if (expandedRow){
            const next = expandedRow.nextElementSibling;
            const expRow = next && next.classList.contains('expand-row') && next.classList.contains('open') ? next : null;
            if (window.tourReplaceTarget){
              window.tourReplaceTarget(expRow ? [expandedRow, expRow] : expandedRow, 'top');
            }
          } else {
            const openCard = document.querySelector('.route-card.card-open');
            if (openCard && window.tourReplaceTarget){
              window.tourReplaceTarget(openCard, 'top');
            }
          }
        }, 80);
      },
    },
    {
      title:'Prices Tab',
      text:'<p>The <em>Prices</em> tab shows what every good costs to buy or sell in each city, all at once.</p><p>Switch between <em>Buy</em> and <em>Sell</em> to see the full picture. All your modifiers from the Merchant Setup are already factored in.</p>',
      textMobile:'<p>The <em>Prices</em> tab shows what every good costs to buy or sell in each city. Switch between Buy and Sell using the buttons at the top.</p>',
      target:'#pricesPanel',
      side:'top',
      tab:'prices',
    },
    {
      title:'Events Tab',
      text:'<p>Events occur every 30 minutes and last 1 hour. They shift sell prices globally for affected goods across all servers.</p><p>The legend at the top shows all four event types and what each one affects. Set what is active in each city and the routes table updates instantly.</p>',
      target:'#tabEvents',
      side:'bottom',
      tab:'events',
      beforeShow:async function(){
        $$('.expand-row.open').forEach(function(r){ r.classList.remove('open'); });
        $$('.row-expanded').forEach(function(r){ r.classList.remove('row-expanded'); });
        $$('.route-card.card-open').forEach(function(c){ c.classList.remove('card-open'); });
      },
    },
    {
      title:'Setting an Event',
      text:'<p>We just placed a sample <em>Conflict</em> event in Damascus.</p><p>Each active city row shows the event glyph, name, and level. The countdown timer appears on the right. When it runs out, the event clears automatically.</p>',
      target:'.evrow[data-city="Damascus"]',
      side:'right',
      tab:'events',
      beforeShow:function(){
        if (window.setCityEvent) window.setCityEvent('Damascus', 'Conflict', 3, 5 * 60 * 1000);
      },
    },
    {
      title:'Event Timer',
      text:'<p>While an event is active, a <em>timer pill</em> appears on the right side of the screen. It shows the city, the event type, and how long is left on the clock.</p>',
      target:'#eventFloater',
      side:'left',
      tab:'events',
    },
    {
      title:'See the price shift',
      text:'<p>Now look at the route table. Routes that buy or sell in Damascus show a small <em>event badge</em> on the city name, and the prices have changed.</p><p>Hover any price to see exactly how the event modifier was applied.</p>',
      textMobile:'<p>Now look at the route cards. Routes that buy or sell in Damascus show a small <em>event badge</em> on the city name, and the prices have changed.</p>',
      target:'#routeTable tbody tr:has(.event-tag)',
      targetMobile:'.route-card:has(.event-tag)',
      side:'top',
      tab:'routes',
      beforeShow:function(){
        if (window.setCityEvent && !document.querySelector('.event-tag')) {
          window.setCityEvent('Damascus', 'Conflict', 3, 5 * 60 * 1000);
        }
      },
    },
    {
      title:'Clearing an Event',
      text:'<p>Events end on their own when the timer runs out. You can also press <em>Clear Event</em> to end one early.</p><p>We are clearing the sample event now so it does not affect your numbers later.</p>',
      target:'.evrow[data-city="Damascus"]',
      side:'right',
      tab:'events',
      beforeShow:function(){
        if (window.clearCityEvent) window.clearCityEvent('Damascus');
      },
    },
    {
      title:'Tools Tab',
      text:'<p>Two tools live here: <strong>Courier Route Planner</strong> and <strong>Find Optimal Setup</strong>. Let\'s walk through both.</p>',
      target:'#tabTools',
      side:'bottom',
      tab:'tools',
    },
    {
      title:'Courier Route Planner',
      text:'<p>Pick your <strong>starting city</strong>, then enable a <strong>Short</strong> or <strong>Long</strong> courier quest (or both) and choose their destination. The planner combines your package delivery stops with the most profitable trade goods to carry at each leg of the journey.</p><p>Hit <em>Deliver Package</em> to reveal the full outbound trip, then check <em>Return to starting city</em> to plan the trip home too.</p>',
      target:'#courierStart',
      side:'bottom',
      tab:'tools',
    },
    {
      title:'Find Optimal Setup',
      text:'<p>Not sure which culture or religion gives the best profit? This tool brute-forces every combination of culture, religion, and language skill against your current animals and storage.</p><p>Hit <em>Find Optimal Setup</em> and it returns the single best configuration for your route.</p>',
      target:'button[onclick="runOptimalFinder()"]',
      side:'top',
      tab:'tools',
      tryLabel:'Click Find Optimal Setup',
      waitEvent:{ selector:'button[onclick="runOptimalFinder()"]', event:'click' },
      onSatisfied:function(){
        setTimeout(function(){
          var r = document.querySelector('#optimalResult');
          if (r && window.tourReplaceTarget) window.tourReplaceTarget(r, 'top');
        }, 150);
      },
      beforeShow:function(){
        var r = document.querySelector('#optimalResult');
        if (r) r.innerHTML = '';
        var el = document.querySelector('button[onclick="runOptimalFinder()"]');
        if (el) el.scrollIntoView({block:'center'});
      },
    },
    {
      title:'Settings Tab',
      text:'<p>This tab is where you change the look, save your setups, and replay this tour.</p><p>The <strong>Display</strong> section also lets you toggle the walking animation at the bottom of the screen.</p>',
      target:'#tabSettings',
      side:'bottom',
      tab:'settings',
    },
    {
      title:'Try a different theme',
      text:'<p>The calculator has two looks: <em>Parchment & Gold</em> (warm, ledger-style) and <em>Modern Slate</em> (clean, dark).</p><p>Click <em>Modern Slate</em> to try it. Click <em>Parchment & Gold</em> to come back. Your choice is saved automatically.</p>',
      target:'.theme-picker',
      side:'top',
      tab:'settings',
      tryLabel:'Pick a theme',
      waitEvent:{ selector:'input[name="theme"]', event:'change' },
    },
    {
      title:'Save your setup',
      text:'<p>You can save your current merchant setup by name and load it back any time.</p><p>Useful when you want to switch between, say, a "Byzantine Christian" build and a "Persian Zoroastrian" build without retyping everything.</p>',
      target:'#setupNameInput',
      side:'top',
      tab:'settings',
    },
    {
      title:'About Tab',
      text:'<p>The <em>About</em> tab tells you who made the calculator and explains the price formula.</p>',
      target:'#tabAbout',
      side:'bottom',
      tab:'about',
    },
    {
      title:'Credits & links',
      text:'<p>Made by community members. Use the buttons here to join the official Silk Road <em>Discord</em> or visit the wiki.</p>',
      target:'.credits-card',
      side:'top',
      tab:'about',
    },
    {
      title:'Changelog',
      text:'<p>Every update gets logged here. Check this card to see what is new in each version.</p>',
      target:'.changelog-card',
      side:'bottom',
      tab:'about',
      beforeShow:function(){
        var el = document.querySelector('.changelog-card');
        if (el) el.scrollIntoView({block:'start'});
      },
    },
    {
      title:'Send feedback',
      text:'<p>If you spot wrong prices, missing routes, or anything broken, use <em>Thomas</em> - the feedback button.</p><p>You can send a bug report, suggestion, or general feedback. Each goes to a separate Discord channel.</p>',
      textMobile:'<p>If you spot wrong prices, missing routes, or anything broken, tap the <em>Feedback</em> button (envelope icon at the bottom-left).</p>',
      target:'#feedbackContainer',
      side:'left',
      tab:'about',
      beforeShow:function(){
        document.body.classList.add('tour-show-feedback');
      },
      afterLeave:function(){
        document.body.classList.remove('tour-show-feedback');
      },
    },
    {
      title:'You are ready',
      text:'<p>That is the whole tour.</p><p>Set up your merchant on the left, look at the routes table, and start earning. Good luck out there.</p>',
      textMobile:'<p>That is the whole tour.</p><p>Tap the <em>Merchant Setup</em> bar at the top to set things up, then look at the route cards. Good luck out there.</p>',
      target:null,
      tab:'routes',
    },
  ];

  /* State */
  let idx = 0;
  let active = false;
  let waitListeners = [];
  let currentTry = null;     // {satisfied:bool}
  let resizeRaf = null;

  /* Element refs */
  const scrim    = $('#onbScrim');
  const spot     = $('#onbSpot');
  const frameT   = $('.onb-frame.frame-t');
  const frameR   = $('.onb-frame.frame-r');
  const frameB   = $('.onb-frame.frame-b');
  const frameL   = $('.onb-frame.frame-l');
  const card     = $('#onbCard');
  const titleEl  = $('#onbCardTitle');
  const bodyEl   = $('#onbCardBody');
  const stepEl   = $('#onbStep');
  const dotsEl   = $('#onbDots');
  const tryEl    = $('#onbTry');
  const tryTxt   = $('#onbTryText');
  const nextBtn  = $('#onbNext');
  const backBtn  = $('#onbBack');
  const skipBtn  = $('#onbSkip');
  const dontShow = $('#onbDontShowCheck');

  /* Wire buttons */
  if (nextBtn) nextBtn.addEventListener('click', function(){ go(1); });
  if (backBtn) backBtn.addEventListener('click', function(){ go(-1); });
  if (skipBtn) skipBtn.addEventListener('click', function(){ endTour(); });
  if (dontShow) dontShow.addEventListener('change', function(){
    if (this.checked) localStorage.setItem(TOUR_OFF_KEY, '1');
    else localStorage.removeItem(TOUR_OFF_KEY);
    var t = $('#tourOffToggle'); if (t) t.checked = this.checked;
  });

  /* Public API */
  /* Tour character logic */
  const tChar   = document.getElementById('tourChar');
  const tCharSvg= tChar ? tChar.querySelector('svg') : null;
  const tArmR   = document.getElementById('tcArmR');
  let   tTalkTmr= null;
  let   tWalkTmr= null;

  function tcCls(add, rem){
    if (!tChar) return;
    rem.forEach(function(c){ tChar.classList.remove(c); });
    add.forEach(function(c){ tChar.classList.add(c); });
  }
  function tcShow(){ if (tChar) tChar.style.display = 'block'; }
  function tcHide(){
    if (!tChar) return;
    tChar.style.display = 'none';
    tcCls([], ['tc-idle','tc-walk','tc-talking','tc-entering','tc-wave']);
  }
  function tcTalk(){
    clearTimeout(tTalkTmr);
    tcCls(['tc-talking'], []);
    tTalkTmr = setTimeout(function(){ if (tChar) tChar.classList.remove('tc-talking'); }, 2800);
  }
  function tcWalk(){
    clearTimeout(tWalkTmr);
    tcCls(['tc-walk'], ['tc-idle','tc-talking']);
    tWalkTmr = setTimeout(function(){
      tcCls(['tc-idle'], ['tc-walk']);
      tcTalk();
    }, 420);
  }
  function tcWave(){
    tcCls(['tc-wave'], ['tc-walk','tc-idle','tc-talking']);
    setTimeout(function(){ if (tChar) tChar.classList.remove('tc-wave'); }, 1800);
  }
  function tcPointAt(targetEl, charLeft, charTop){
    if (!tArmR || !tChar || !targetEl) return;
    const flip = tCharSvg && tCharSvg.style.transform.includes('scaleX(-1)');
    const cw = 70, ch = 110;
    // Use the INTENDED final position, not the transitioning current position
    const cl = charLeft !== undefined ? charLeft : parseFloat(tChar.style.left) || 0;
    const ct = charTop  !== undefined ? charTop  : parseFloat(tChar.style.top)  || 0;
    // Shoulder is visually on left when flipped, right when normal
    const sx = flip ? cl + cw * 0.10 : cl + cw * 0.90;
    const sy = ct + ch * 0.43;
    const tr = targetEl.getBoundingClientRect();
    const tx = tr.left + tr.width  / 2;
    const ty = tr.top  + tr.height / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    let cssAngle = Math.atan2(flip ? dx : -dx, dy) * 180 / Math.PI;
    cssAngle = Math.max(-160, Math.min(20, cssAngle));
    tArmR.style.transform = 'rotate(' + cssAngle + 'deg)';
  }

  function tcApplyPos(cx, cy, targetEl){
    // First placement: skip transition so character doesn't fly in from 0,0
    if (!tChar.dataset.placed){
      tChar.style.transition = 'none';
      void tChar.offsetWidth;
    }
    tChar.style.left = cx + 'px';
    tChar.style.top  = cy + 'px';
    if (!tChar.dataset.placed){
      tChar.dataset.placed = '1';
      void tChar.offsetWidth;
      tChar.style.transition = '';
    }
    // Face toward target (or center screen when no target)
    if (tCharSvg){
      const facingLeft = targetEl
        ? (targetEl.getBoundingClientRect().left + targetEl.getBoundingClientRect().width / 2) < (cx + 35)
        : false;
      tCharSvg.style.transform = facingLeft ? 'scaleX(-1)' : '';
    }
    // Point arm after character transition settles (~380ms + buffer)
    setTimeout(function(){ tcPointAt(targetEl, cx, cy); }, 430);
  }

  function tcPlace(targetEl){
    if (!tChar) return;
    // Short delay so card has its final rendered position before we read it
    setTimeout(function(){
      const cr = card.getBoundingClientRect();
      if (!cr.width) return;
      const cw = 70, ch = 110, gap = 14;
      const vw = window.innerWidth, vh = window.innerHeight;
      let cx, cy;
      if (vw - cr.right >= cw + gap){
        // Right of card
        cx = cr.right + gap;
        cy = Math.max(8, Math.min(vh - ch - 8, cr.bottom - ch));
      } else if (cr.left >= cw + gap){
        // Left of card
        cx = cr.left - cw - gap;
        cy = Math.max(8, Math.min(vh - ch - 8, cr.bottom - ch));
      } else {
        // No side room - go below card
        cx = Math.max(8, Math.min(vw - cw - 8, cr.left + (cr.width - cw) / 2));
        cy = Math.min(vh - ch - 8, cr.bottom + gap);
      }
      tcApplyPos(cx, cy, targetEl);
    }, 60);
  }

  window.startTour = function(){
    idx = 0;
    active = true;
    document.body.classList.add('onb-active','tour-active');
    if (window.switchTab) window.switchTab('routes');
    // close everything
    $$('.expand-row.open').forEach(function(r){ r.classList.remove('open'); });
    $$('.row-expanded').forEach(function(r){ r.classList.remove('row-expanded'); });
    $$('.route-card.card-open').forEach(function(c){ c.classList.remove('card-open'); });
    if (isMobile() && document.body.dataset.sidebar !== 'collapsed'){
      var btn = $('#sidebarToggle'); if (btn) btn.click();
    }
    scrim.classList.add('is-active');
    if (dontShow) dontShow.checked = localStorage.getItem(TOUR_OFF_KEY) === '1';
    if (tChar) tChar.removeAttribute('data-placed');
    tcShow();
    tcCls(['tc-entering','tc-idle'], ['tc-walk','tc-talking','tc-wave']);
    setTimeout(function(){ if (tChar) tChar.classList.remove('tc-entering'); }, 450);
    render();
  };

  window.endTour = function(){
    active = false;
    if (window.clearCityEvent) window.clearCityEvent('Damascus');
    scrim.classList.remove('is-active','is-interactive','is-centered');
    card.classList.remove('is-visible');
    spot.classList.remove('is-visible','is-pulsing');
    document.body.classList.remove('onb-active','tour-active','tour-show-feedback');
    clearWaitListeners();
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    tcWave();
    setTimeout(tcHide, 1900);
    setTimeout(function(){ if (window.showWhatsNew) window.showWhatsNew(); }, 2300);
  };

  window.tourGo = function(dir){ go(dir); };

  // Update the spotlight target mid-step (e.g. once the user expands a row,
  // we re-target both the row and its expanded sibling so they can see
  // what they revealed).
  window.tourReplaceTarget = function(targetOrList, preferredSide){
    if (!active) return;
    if (Array.isArray(targetOrList)){
      // Scroll the union into view
      const first = targetOrList[0];
      if (first) {
        scrollIntoView(first).then(function(){
          placeWithTarget(targetOrList, preferredSide || 'top');
        });
      }
    } else if (targetOrList){
      scrollIntoView(targetOrList).then(function(){
        placeWithTarget(targetOrList, preferredSide || 'top');
      });
    }
  };

  window.onTourToggle = function(checked){
    if (checked) localStorage.setItem(TOUR_OFF_KEY, '1');
    else localStorage.removeItem(TOUR_OFF_KEY);
    if (dontShow) dontShow.checked = checked;
  };

  /* Internals */
  function go(dir){
    if (!active) return;
    // Run afterLeave for the step we're leaving
    const leavingStep = STEPS[idx];
    if (leavingStep && leavingStep.afterLeave){
      try { leavingStep.afterLeave(); } catch(_){}
    }
    if (dir > 0 && idx >= STEPS.length - 1){ endTour(); return; }
    idx = Math.max(0, Math.min(STEPS.length - 1, idx + dir));
    render();
  }

  function showTourSplash(){
    var sp = document.getElementById('tourSplash');
    if (!sp) return;
    // Clone to reset all CSS animations from scratch
    var fresh = sp.cloneNode(true);
    sp.parentNode.replaceChild(fresh, sp);
    fresh.style.display = 'flex';
    setTimeout(function(){
      fresh.style.transition = 'opacity .7s ease';
      fresh.style.opacity = '0';
      setTimeout(function(){
        fresh.style.display = 'none';
        fresh.style.opacity = '';
        fresh.style.transition = '';
      }, 750);
    }, 5400);
  }

  function clearWaitListeners(){
    waitListeners.forEach(function(rec){
      try { rec.el.removeEventListener(rec.event, rec.fn, true); } catch(_){}
    });
    waitListeners = [];
    currentTry = null;
  }

  function renderDots(){
    dotsEl.innerHTML = '';
    for (let i = 0; i < STEPS.length; i++){
      const d = document.createElement('span');
      d.className = 'onb-dot' + (i === idx ? ' is-current' : (i < idx ? ' is-done' : ''));
      d.title = 'Step ' + (i + 1);
      d.addEventListener('click', function(){
        idx = i; render();
      });
      dotsEl.appendChild(d);
    }
  }

  function setTryDone(done){
    if (!tryEl) return;
    tryEl.classList.toggle('is-done', !!done);
    if (nextBtn) nextBtn.disabled = false;  // still allow Next either way; "done" is just a visual confirmation
  }

  function pickTarget(step){
    const mobile = isMobile();
    const sel = (mobile && step.targetMobile) ? step.targetMobile : step.target;
    if (!sel) return null;
    return document.querySelector(sel);
  }

  async function render(){
    const step = STEPS[idx];
    const mobile = isMobile();
    const isLast  = idx === STEPS.length - 1;
    const isFirst = idx === 0;

    // Hide while we transition
    card.classList.remove('is-visible');
    clearWaitListeners();
    setTryDone(false);

    const beforeShowPromise = step.beforeShow ? Promise.resolve(step.beforeShow()).catch(function(){}) : Promise.resolve();

    await beforeShowPromise;

    // Switch tab and update content at the same time
    if (step.tab && window.switchTab) window.switchTab(step.tab);

    // Update content
    titleEl.textContent = step.title;
    bodyEl.innerHTML    = (mobile && step.textMobile) ? step.textMobile : step.text;
    stepEl.textContent  = (idx + 1) + ' / ' + STEPS.length;
    nextBtn.textContent = isLast ? 'Finish' : 'Next';
    backBtn.style.visibility = isFirst ? 'hidden' : 'visible';
    renderDots();

    // "Try this" callout
    const tryLabel = (mobile && step.tryLabelMobile) ? step.tryLabelMobile : step.tryLabel;
    if (tryLabel){
      tryTxt.textContent = tryLabel;
      tryEl.style.display = '';
      currentTry = { satisfied:false };
      // pre-check waitFor in case condition is already true
      if (step.waitFor && step.waitFor()){
        currentTry.satisfied = true;
        setTryDone(true);
      } else if (step.waitEvent){
        const sels = step.waitEvent.selector.split(',');
        sels.forEach(function(sel){
          const els = $$(sel.trim());
          els.forEach(function(el){
            const fn = function(){
              // Defer so target's own bubble-phase handlers run first
              // (e.g. the row click handler adds .row-expanded). Otherwise
              // waitFor() runs before the DOM mutation happens and we'd
              // need a second click.
              setTimeout(function(){
                if (!currentTry) return;
                if (!step.waitFor || step.waitFor()){
                  currentTry.satisfied = true;
                  setTryDone(true);
                  if (step.onSatisfied){
                    try { step.onSatisfied(); } catch(_){}
                  }
                }
              }, 30);
            };
            el.addEventListener(step.waitEvent.event, fn, true);
            waitListeners.push({el:el, event:step.waitEvent.event, fn:fn});
          });
        });
      }
    } else {
      tryEl.style.display = 'none';
    }

    // Position
    const target = pickTarget(step);
    if (!target){
      scrim.classList.add('is-centered');
      placeCentered();
    } else {
      scrim.classList.remove('is-centered');
      await scrollIntoView(target);
      placeWithTarget(target, step.side || 'bottom');
    }

    // Fade in. Force a synchronous reflow so the transition has a clean
    // baseline - without this, multiple style changes in the same frame
    // (display, transform, top/left) can leave the transition stuck.
    void card.offsetWidth;
    void spot.offsetWidth;
    requestAnimationFrame(function(){
      card.classList.add('is-visible');
      if (target) spot.classList.add('is-visible','is-pulsing');
      else        spot.classList.remove('is-visible','is-pulsing');
      // Character: walk to new position, then talk
      tcWalk();
      tcPlace(target);
    });
  }

  function placeFramesFullScreen(){
    // Cover entire viewport - used in centered mode and as a starting state
    frameT.style.top = '0px'; frameT.style.left = '0px';
    frameT.style.width = '100vw'; frameT.style.height = '100vh';
    frameR.style.top = '0px'; frameR.style.left = '100vw';
    frameR.style.width = '0'; frameR.style.height = '0';
    frameB.style.top = '100vh'; frameB.style.left = '0px';
    frameB.style.width = '0'; frameB.style.height = '0';
    frameL.style.top = '0px'; frameL.style.left = '0px';
    frameL.style.width = '0'; frameL.style.height = '0';
  }

  function placeFramesAroundRect(r, pad){
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const t = Math.max(0, r.top - pad);
    const l = Math.max(0, r.left - pad);
    const w = Math.min(vw, r.width + pad * 2);
    const h = Math.min(vh, r.height + pad * 2);
    // top frame
    frameT.style.top = '0px'; frameT.style.left = '0px';
    frameT.style.width = vw + 'px'; frameT.style.height = t + 'px';
    // bottom frame
    frameB.style.top = (t + h) + 'px'; frameB.style.left = '0px';
    frameB.style.width = vw + 'px'; frameB.style.height = Math.max(0, vh - (t + h)) + 'px';
    // left frame
    frameL.style.top = t + 'px'; frameL.style.left = '0px';
    frameL.style.width = l + 'px'; frameL.style.height = h + 'px';
    // right frame
    frameR.style.top = t + 'px'; frameR.style.left = (l + w) + 'px';
    frameR.style.width = Math.max(0, vw - (l + w)) + 'px'; frameR.style.height = h + 'px';
  }

  function placeCentered(){
    card.classList.add('is-center');
    card.removeAttribute('data-arrow');
    card.style.top = '';
    card.style.left = '';
    // Hide spotlight in center mode
    spot.style.top = '50%';
    spot.style.left = '50%';
    spot.style.width = '0px';
    spot.style.height = '0px';
    spot.classList.remove('is-visible','is-pulsing');
    placeFramesFullScreen();
  }

  function placeWithTarget(el, preferredSide){
    card.classList.remove('is-center');

    // el may be a single Element or an array of Elements; compute union rect
    let r;
    if (Array.isArray(el)){
      const rects = el.filter(Boolean).map(function(x){ return x.getBoundingClientRect(); });
      if (!rects.length) return;
      const top    = Math.min.apply(null, rects.map(function(x){ return x.top; }));
      const left   = Math.min.apply(null, rects.map(function(x){ return x.left; }));
      const right  = Math.max.apply(null, rects.map(function(x){ return x.right; }));
      const bottom = Math.max.apply(null, rects.map(function(x){ return x.bottom; }));
      r = { top:top, left:left, right:right, bottom:bottom, width:right-left, height:bottom-top };
    } else {
      r = el.getBoundingClientRect();
    }
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = isMobile();

    // Place spotlight
    spot.style.top    = (r.top  - pad) + 'px';
    spot.style.left   = (r.left - pad) + 'px';
    spot.style.width  = (r.width  + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    // Frame the dim around the spotlight rect - leaves a real, clickable hole
    placeFramesAroundRect(r, pad);

    if (mobile){
      // Mobile: card always pinned at bottom (CSS handles); no arrow
      card.removeAttribute('data-arrow');
      card.style.top  = '';
      card.style.left = '';
      return;
    }

    // Desktop: place card on the side with the most room
    const cw = card.offsetWidth || 380;
    const ch = card.offsetHeight || 260;
    const gap = 18;

    const space = {
      top:    r.top - gap,
      bottom: vh - r.bottom - gap,
      left:   r.left - gap,
      right:  vw - r.right - gap,
    };

    // Choose side: preferred first if it fits, else the side with most room
    const fits = {
      top:    space.top    >= ch + 16,
      bottom: space.bottom >= ch + 16,
      left:   space.left   >= cw + 16,
      right:  space.right  >= cw + 16,
    };

    let side = preferredSide;
    if (!fits[side]){
      // fallback: pick the side with the most space
      side = Object.keys(space).reduce(function(a,b){ return space[a] >= space[b] ? a : b; });
    }

    let top, left;
    if (side === 'bottom'){
      top  = r.bottom + gap;
      left = r.left + r.width / 2 - cw / 2;
    } else if (side === 'top'){
      top  = r.top - gap - ch;
      left = r.left + r.width / 2 - cw / 2;
    } else if (side === 'right'){
      top  = r.top + r.height / 2 - ch / 2;
      left = r.right + gap;
    } else { // left
      top  = r.top + r.height / 2 - ch / 2;
      left = r.left - gap - cw;
    }

    // Clamp inside viewport
    left = Math.max(14, Math.min(vw - cw - 14, left));
    top  = Math.max(14, Math.min(vh - ch - 14, top));

    // Arrow direction = opposite of card side relative to target
    const arrowMap = { top:'bottom', bottom:'top', left:'right', right:'left' };
    card.setAttribute('data-arrow', arrowMap[side]);

    card.style.top  = top  + 'px';
    card.style.left = left + 'px';
  }

  function scrollIntoView(el){
    return new Promise(function(resolve){
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const margin = 80;
      const fullyVisible = r.top >= margin && r.bottom <= vh - margin;
      if (fullyVisible){ resolve(); return; }
      const target = window.scrollY + r.top - (vh / 2 - r.height / 2);
      window.scrollTo({ top: Math.max(0, target), behavior: 'instant' });
      resolve();
    });
  }

  /* Reposition on resize/scroll */
  function reposition(){
    if (!active) return;
    const step = STEPS[idx]; if (!step) return;
    const target = pickTarget(step);
    if (!target){ placeCentered(); return; }
    placeWithTarget(target, step.side || 'bottom');
  }
  window.addEventListener('resize', function(){
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(reposition);
  });
  window.addEventListener('scroll', function(){
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(reposition);
  }, { passive:true });

  /* Esc to close */
  document.addEventListener('keydown', function(e){
    if (!active) return;
    if (e.key === 'Escape') endTour();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft')  go(-1);
  });

  /* Init - auto-start for new visitors */
  document.addEventListener('DOMContentLoaded', function(){
    showTourSplash();
    const off  = localStorage.getItem(TOUR_OFF_KEY)  === '1';
    const seen = localStorage.getItem(TOUR_SEEN_KEY) === '1';
    const t    = $('#tourOffToggle');
    if (t) t.checked = off;
    if (dontShow) dontShow.checked = off;
    if (!off && !seen) {
      setTimeout(function(){ window.startTour(); }, 800);
    } else {
      // No tour - show What's New after loading screen fully hides (5400ms fade start + 750ms fade)
      setTimeout(function(){ if (window.showWhatsNew) window.showWhatsNew(); }, 6200);
    }
  });
})();

/* Walker variant controller */
(function(){
  var charWrap  = document.getElementById('wkCharWrap');
  var camelWrap = document.getElementById('wkCamelWrap');
  var peekHead  = document.getElementById('wkPeekHead');

  function teleport(el, x){
    el.style.transition = 'none';
    el.style.left = x + 'px';
    el.offsetWidth; // force reflow to flush transition:none
  }

  function slide(el, x, ms, ease){
    return new Promise(function(res){
      el.style.transition = 'left ' + ms + 'ms ' + (ease || 'linear');
      el.style.left = x + 'px';
      setTimeout(res, ms);
    });
  }

  function faceRight(wrap){ wrap.style.transform = ''; }
  function faceLeft(wrap) { wrap.style.transform = 'scaleX(-1)'; }

  function resetClasses(){
    charWrap.classList.remove('wk-looking', 'wk-scratching', 'wk-jumping', 'wk-running');
    camelWrap.classList.remove('wk-stopped');
  }

  /* Variant 1: classic stroll - both cross together */
  function variant1(done){
    var W   = window.innerWidth;
    var dur = 24000;
    resetClasses();
    faceRight(charWrap);
    faceRight(camelWrap);
    teleport(charWrap,  -75);
    teleport(camelWrap, -175);

    Promise.all([
      slide(charWrap,  W + 55, dur, 'linear'),
      slide(camelWrap, W + 10, dur, 'linear')
    ]).then(function(){
      setTimeout(done, 7000);
    });
  }

  /* Variant 2: camel rebels, merchant chases */
  function variant2(done){
    var W    = window.innerWidth;
    var midX = Math.round(W * 0.44);

    // Derive all durations from variant1's char speed so everything looks the same pace
    // Char in v1: -75 to W+55 in 24000ms, speed = (W+130)/24000 px/ms
    var spd = (W + 130) / 24000;

    var s1t     = Math.round((midX + 130) / spd); // char -75 -> midX+55
    var s2t     = Math.round((W - midX)   / spd); // char midX+55 -> W+55
    var cLeftT  = Math.round((midX + 175) / spd); // camel midX -> -175 (same speed)
    var retT    = Math.round((W * 0.48 + 75) / spd); // merchant W+75 -> W*0.52

    resetClasses();
    faceRight(charWrap);
    faceRight(camelWrap);
    teleport(charWrap,  -75);
    teleport(camelWrap, -175);
    peekHead.style.display = 'none';
    teleport(peekHead, -65);

    // Stage 1: both walk right to mid-screen at normal pace
    Promise.all([
      slide(charWrap,  midX + 55, s1t, 'linear'),
      slide(camelWrap, midX,      s1t, 'linear')
    ]).then(function(){

      // Stage 2: camel pauses 1.8s then walks left at normal pace
      camelWrap.classList.add('wk-stopped');
      setTimeout(function(){
        camelWrap.classList.remove('wk-stopped');
        faceLeft(camelWrap);
        slide(camelWrap, -175, cLeftT, 'linear');
      }, 1800);

      // Char continues right at same pace
      return slide(charWrap, W + 55, s2t, 'linear');

    }).then(function(){

      // Stage 3: merchant re-enters from right, walks left for 1.5s then stops
      faceLeft(charWrap);
      teleport(charWrap, W + 75);
      var stopX = Math.round(W + 75 - spd * 1500);
      return slide(charWrap, stopX, 1500, 'linear');

    }).then(function(){

      // Stage 4: merchant scratches head
      charWrap.classList.add('wk-scratching');
      return new Promise(function(res){ setTimeout(res, 2400); });

    }).then(function(){

      // Stage 5: camel head peeks from left
      peekHead.style.display = 'block';
      teleport(peekHead, -65);
      return slide(peekHead, 0, 1100, 'ease-out');

    }).then(function(){
      // Beat - merchant spots it
      return new Promise(function(res){ setTimeout(res, 700); });

    }).then(function(){

      // Stage 6: camel ducks back, merchant does cartoon jump
      slide(peekHead, -65, 280, 'ease-in');
      charWrap.classList.remove('wk-scratching');
      charWrap.classList.add('wk-jumping');
      return new Promise(function(res){ setTimeout(res, 480); });

    }).then(function(){

      // Stage 7: merchant sprints left after camel
      charWrap.classList.remove('wk-jumping');
      charWrap.classList.add('wk-running');
      return slide(charWrap, -75, 820, 'ease-in');

    }).then(function(){
      peekHead.style.display = 'none';
      resetClasses();
      setTimeout(done, 900);
    });
  }

  // Play in strict alternating order: 1, 2, 1, 2 ...
  var seq = [variant1, variant2];
  var idx = 0;

  function run(){
    seq[idx % 2](function(){ idx++; setTimeout(run, 400); });
  }

  setTimeout(run, 1800);
})();
