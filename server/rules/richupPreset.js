export const richupPreset = Object.freeze({
  id: 'richup-v1',
  startingCash: 2000,
  turnTimeSec: 40,
  mortgageRatio: 0.5,          // bank pays 50% of price
  unmortgageRatio: 0.55,        // player pays 55% of price to lift (50% + 10% interest)
  doubleRentOnSet: true,
  jailBlocksRent: true,
  mandatoryAuctionOnSkip: true,
  timeoutPenaltyStep: 50,
  goSalary: 200,
  jailFine: 50,
  jailIndex: 10,
  utilityDiceMultiplierOne:   4,   // 1 company:  4× dice
  utilityDiceMultiplierBoth:  10,  // 2 companies: 10× dice
  utilityDiceMultiplierThree: 20,  // 3 companies: 20× dice
});
