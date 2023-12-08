import * as math from "mathjs";
import { fft, util as fftUtil } from "fft-js";
import ts from "timeseries-analysis";
import { lowPassFilter } from "low-pass-filter";

/**
 *
 * @param {Array(100)} signal
 */

var projectionMatrix = math.matrix([
  [0, 1, -1],
  [-2, 1, 1],
]);

function checkNaN(arr) {
  for (var i = 0; i < arr.length; i++) {
    // check if array value is false or NaN
    if (arr[i] === false || Number.isNaN(arr[i])) {
      return true;
    }
  }
}

function argMax(array) {
  return array.map((x, i) => [x, i]).reduce((r, a) => (a[0] > r[0] ? a : r))[1];
}

function calculateBPM(arr) {
  var bpm = -1;
  arr = arr.filter((s) => s.frequency > 0.8 && s.frequency < 2);
  if (arr.length > 0) {
    var max = argMax(arr.map((s) => s.magnitude));
    bpm = arr.map((s) => s.frequency)[max] * 60;
    console.log("BPM", bpm);
  }
  return bpm;
}

function calculateRR(arr) {
  var rr = -1;
  arr = arr.filter((s) => s.frequency > 0.2 && s.frequency < 0.5);
  if (arr.length > 0) {
    var max = argMax(arr.map((s) => s.magnitude));
    rr = arr.map((s) => s.frequency)[max] * 60;
    console.log("RR", rr);
  }
  return rr;
}

function logFit(arr) {
  var out = new Array();
  for (var i = 0; i < arr.length; i++) {
    var val = 100 - Math.log(100 * Math.abs(arr[i]));
    if (val == Infinity) {
      continue;
    }
    out.push(val);
  }
  return out;
}

function calculateOSAT(arr) {
  if (arr.length < 10) {
    return -1;
  }
  var t = new ts.main(ts.adapter.fromArray(arr));
  var coeffs = t.ARLeastSquare({ degree: 9 });
  var forecast = 0; // Init the value at 0.
  for (var i = 0; i < coeffs.length; i++) {
    // Loop through the coefficients
    forecast += t.data[t.data.length - 1 - i][1] * coeffs[i];
    // Explanation for that line:
    // t.data contains the current dataset, which is in the format [ [date, value], [date,value], ... ]
    // For each coefficient, we substract from "forecast" the value of the "N - x" datapoint's value, multiplicated by the coefficient, where N is the last known datapoint value, and x is the coefficient's index.
  }
  // console.log(forecast);
}

let HR = new Array();

export function POS(signal, window) {
  // signal = {date, R, G, B}
  var H = new Array(signal.length).fill(0);
  signal = signal.slice(50, signal.length);
  for (var i = 0; i < signal.length - window; i++) {
    // Temporal Normalization
    var C = new Array(window);
    signal.slice(i, i + window).forEach((v, ind) => {
      C[ind] = [v.R, v.G, v.B];
    });
    C = math.transpose(C);
    var mean = math.mean(C, 1);
    var diag = math.diag(mean);
    var inv = math.inv(diag);
    var Cn = math.multiply(inv, C);

    // Step 3
    var S = math.multiply(projectionMatrix, Cn);
    S = S._data;

    // Step 4 -> 2D signal to 1D signal
    var std = [1, math.std(S[0]) / math.std(S[1])];
    var P = math.multiply(std, S);

    // Step 5 -> Overlap adding
    var a = math.subtract(P, math.divide(math.mean(P), math.std(P)));

    a = math.add(H.slice(i, i + window), a);

    H.splice(i, window, ...a);
  }

  lowPassFilter(H, 2, 12, 1);

  let hasNaN = checkNaN(H);
  var both = new Array(64).fill({ frequency: 0, magnitude: 0 });
  if (!hasNaN) {
    try {
      var phasors = fft(H);

      var frequencies = fftUtil.fftFreq(phasors, 3), // Sample rate and coef is just used for length, and frequency step
        magnitudes = fftUtil.fftMag(phasors);

      var both = frequencies.map(function (f, ix) {
        return { frequency: f, magnitude: magnitudes[ix] };
      });

      // console.log(both);
    } catch (error) {
      console.log(error);
    }
  }

  var bpm = calculateBPM(both);
  var rr = calculateRR(both);
  var r = signal.map((s) => s["R"]);
  lowPassFilter(r, 5.5, 12, 1);
  r = logFit(r);
  var oSat = calculateOSAT(r);
  return [H, both, bpm, rr];
}
