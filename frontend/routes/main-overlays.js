// Overlay and walker animation controllers.

/* Onboarding tour removed — to be rebuilt for multi-page site */
(function(){
  // stub — keeps window.startTour / window.tourGo defined so no console errors
  window.startTour  = function(){};
  window.tourGo     = function(){};
  window.onTourToggle = function(){};
  window.tourReplaceTarget = function(){};
  void 0; // tour body removed
})();

/* Walker variant controller */
(function(){
  var charWrap  = document.getElementById('wkCharWrap');
  var camelWrap = document.getElementById('wkCamelWrap');
  var peekHead  = document.getElementById('wkPeekHead');
  if (!charWrap || !camelWrap) return;

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
