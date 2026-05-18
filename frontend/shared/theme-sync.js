(function () {
  'use strict';
  try {
    var k = 'silkroad_theme';
    localStorage.setItem(k, 'slate');
    document.body.dataset.theme = 'slate';
  } catch (_) {
    document.body.dataset.theme = 'slate';
  }
})();
