// walkforward.js — the out-of-sample split machinery for FITTED strategies.
//
// Why this exists: every rule tested so far (the dashboard MA rule, Faber,
// TSMOM, the MACD cross, the RSI recross) had ZERO fitted parameters — the
// numbers 20/50/200, 10 months, 12/26/9, 30 were all frozen before the
// harness ever saw a price, so the whole history was honestly out-of-sample.
// That free pass ends the moment anything is CHOSEN FROM DATA: an MA length
// picked because it backtested best, a weight in the Phase 5c multi-signal
// model, a calibration curve in 5b. A number chosen on some data will always
// look good on THAT data — the only honest score comes from data the chooser
// never saw.
//
// Walk-forward is the standard fix, and it mirrors how a strategy would
// actually be operated:
//
//   [ train 5y ][ test 1y ]                        <- fit here, score there
//         [ train 5y ][ test 1y ]                  <- roll forward, refit
//               [ train 5y ][ test 1y ]
//                                 ...
//
// Fit on a training window, FREEZE the result, apply it to the following
// unseen window, roll forward, repeat. Only the test segments are kept —
// stitched together they form one long out-of-sample record that the
// existing simulator and event machinery can score like any other signal
// series. (With `anchored: true` the training window grows from day 0
// instead of sliding — more data per fit, but old regimes never age out.)
//
// The engine is deliberately strategy-agnostic. The caller provides:
//
//   fit(trainCloses, trainDates) -> model | null
//       Sees ONLY the training window — the API makes lookahead impossible
//       rather than merely discouraged. Return null to skip a fold (e.g.
//       not enough data to warm up). The model is any object; the engine
//       never looks inside it.
//
//   apply(model, prefixCloses, prefixDates) -> signal series (same length)
//       Gets the full history UP TO the test segment's end — so indicators
//       can warm up on pre-test data, exactly as a live strategy would (a
//       200-day SMA on the first test day legitimately uses the previous
//       200 closes; that's memory, not lookahead). Only the test segment
//       [testStart, testEnd) of its output is kept.

// Fold boundaries by trading days: train on `trainDays`, test on the next
// `testDays`, step forward by `testDays` so test segments tile the history
// with no gaps and no overlap. A final stub shorter than `minTestDays` is
// dropped (nothing meaningful can be scored on a few days).
function buildFolds(nDays, { trainDays = 1260, testDays = 252, anchored = false, minTestDays = 21 } = {}) {
  const folds = [];
  for (let testStart = trainDays; testStart < nDays; testStart += testDays) {
    const testEnd = Math.min(testStart + testDays, nDays);
    if (testEnd - testStart < minTestDays) break;
    folds.push({ trainStart: anchored ? 0 : testStart - trainDays, testStart, testEnd });
  }
  return folds;
}

// Run the walk-forward loop. Returns:
//   signals — one full-length series that is null everywhere except inside
//             test segments, where it carries the then-frozen model's output.
//             Feed it to signalsToPositions/simulate/transitionStats as usual;
//             everything after folds[0].testStart is out-of-sample by
//             construction.
//   folds   — one record per fitted fold: the index bounds plus whatever
//             `fit` returned (so callers can report what was chosen when).
function walkForward(closes, dates, { fit, apply, trainDays = 1260, testDays = 252, anchored = false, minTestDays = 21 } = {}) {
  const signals = new Array(closes.length).fill(null);
  const records = [];
  for (const f of buildFolds(closes.length, { trainDays, testDays, anchored, minTestDays })) {
    const model = fit(closes.slice(f.trainStart, f.testStart), dates.slice(f.trainStart, f.testStart));
    if (model == null) continue;
    const applied = apply(model, closes.slice(0, f.testEnd), dates.slice(0, f.testEnd));
    for (let i = f.testStart; i < f.testEnd; i++) signals[i] = applied[i];
    records.push({ ...f, model });
  }
  return { signals, folds: records };
}

module.exports = { buildFolds, walkForward };
