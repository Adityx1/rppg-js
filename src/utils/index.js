export function average(data) {
  if (data.length === 0) return 0;

  let sum = data.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0
  );
  return sum / data.length;
}

export async function initCamera(cameraEl) {
  let stream = {};
  try {
    var getMedia =
      navigator.mediaDevices.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;
    console.log(getMedia);
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { exact: cameraEl.width },
        height: { exact: cameraEl.height },
      },
      audio: false,
    });
  } catch (e) {
    console.log(e);
  }
  if (!stream) {
    throw new Error("Could not obtain video from webcam.");
  }
  cameraEl.srcObject = stream;
  cameraEl.play();
}

export function toRGB(data) {
  let R = new Array();
  let G = new Array();
  let B = new Array();
  for (var i = 0; i < data.length; i += 4) {
    R.push(data[i]);
    G.push(data[i + 1]);
    B.push(data[i + 2]);
  }
  return [R, G, B];
}
