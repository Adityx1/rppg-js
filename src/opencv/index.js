import * as Module from "./opencv.js"; // Your Emscripten JS output file
let opencv = Module().cwrap("opencv"); // Call Module as a function

export default opencv;
