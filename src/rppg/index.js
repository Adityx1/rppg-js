// let math = require("mathjs");
// let _ = require("lodash");
// var fft = require("fft-js").fft,
//   fftUtil = require("fft-js").util;

// var Fili = require("fili");

// //  Instance of a filter coefficient calculator
// var iirCalculator = new Fili.CalcCascades();

// // get available filters
// var availableFilters = iirCalculator.available();

// // calculate filter coefficients
// var iirFilterCoeffs = iirCalculator.bandpass({
//   order: 5, // cascade 3 biquad filters (max: 12)
//   characteristic: "butterworth",
//   Fs: 12, // sampling frequency
//   Fc: 1, // cutoff frequency / center frequency for bandpass, bandstop, peak
//   BW: 2, // bandwidth only for bandstop and bandpass filters - optional
//   gain: 0, // gain for peak, lowshelf and highshelf
//   preGain: false, // adds one constant multiplication for highpass and lowpass
//   // k = (1 + cos(omega)) * 0.5 / k = 1 with preGain == false
// });

// // create a filter instance from the calculated coeffs
// var iirFilter = new Fili.IirFilter(iirFilterCoeffs);

// /**
//  *
//  * @param {Array(100)} signal
//  */

// var projectionMatrix = math.matrix([
//   [0, 1, -1],
//   [-2, 1, 1],
// ]);

// function checkNaN(arr) {
//   for (var i = 0; i < arr.length; i++) {
//     // check if array value is false or NaN
//     if (arr[i] === false || Number.isNaN(arr[i])) {
//       return true;
//     }
//   }
// }

// function argMax(array) {
//   return array.map((x, i) => [x, i]).reduce((r, a) => (a[0] > r[0] ? a : r))[1];
// }

// function calculateBPM(arr) {
//   var bpm = -1;
//   arr = arr.filter((s) => s.frequency > 0.8 && s.frequency < 2);
//   if (arr.length > 0) {
//     var max = argMax(arr.map((s) => s.magnitude));
//     bpm = arr.map((s) => s.frequency)[max] * 60;
//     console.log(bpm);
//   }
//   return bpm;
// }

// export function POS(signal, window) {
//   // signal = {date, R, G, B}
//   var H = new Array(signal.length).fill(0);
//   for (var i = 0; i < signal.length - window; i++) {
//     // Temporal Normalization
//     var C = new Array(window);
//     signal.slice(i, i + window).forEach((v, ind) => {
//       C[ind] = [v.R, v.G, v.B];
//     });
//     C = math.transpose(C);
//     var mean = math.mean(C, 1);
//     var diag = math.diag(mean);
//     var inv = math.inv(diag);
//     var Cn = math.multiply(inv, C);

//     // Step 3
//     var S = math.multiply(projectionMatrix, Cn);
//     S = S._data;

//     // Step 4 -> 2D signal to 1D signal
//     var std = [1, math.std(S[0]) / math.std(S[1])];
//     var P = math.multiply(std, S);

//     // Step 5 -> Overlap adding
//     var a = math.subtract(P, math.mean(P));

//     a = math.add(H.slice(i, i + window), a);

//     H.splice(i, window, ...a);
//   }
//   /* H = iirFilter.multiStep(H);
//   console.log(H); */
//   let hasNaN = checkNaN(H);
//   var both = new Array(64).fill({ frequency: 0, magnitude: 0 });
//   if (!hasNaN) {
//     try {
//       var phasors = fft(H);

//       var frequencies = fftUtil.fftFreq(phasors, 3), // Sample rate and coef is just used for length, and frequency step
//         magnitudes = fftUtil.fftMag(phasors);

//       frequencies.filter((f) => f < 2);
//       var both = frequencies.map(function (f, ix) {
//         return { frequency: f, magnitude: magnitudes[ix] };
//       });

//       console.log(both);
//     } catch (error) {
//       console.log(error);
//     }
//   }

//   var bpm = calculateBPM(both);
//   return [H, both, bpm];
// }
