(function (root) {
  var EC = {
    langMod: {
      nativePct:           0.03,
      foreignL1Pct:       -0.03,
      foreignL3Pct:        0.03,
      zoroL1ByzMultiplier: 1.5,
      judaismL2Multiplier: 1.75,
    },
    repDiscount: {
      minRank:  6,
      discount: 0.1,
    },
    luxury: {
      'Byzantine Silk':  { city: 'Antioch',    culture: 'Byzantine', minRank: 4 },
      'Persian Carpets': { city: 'Ctesiphon',  culture: 'Persian',   minRank: 4 },
    },
  };
  if (typeof module !== 'undefined') module.exports = EC;
  else root.ENGINE_CONSTANTS = EC;
})(typeof window !== 'undefined' ? window : global);
