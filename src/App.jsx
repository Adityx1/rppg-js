import { useEffect, useRef, useState } from "react";
import { average } from "./utils";
import { fastICA } from "./utils/fastICA";
import { Line } from "react-chartjs-2";
import { range } from "lodash";

const arr = [];
const width = 640;
const height = 480;
let src = new window.cv.Mat(height, width, window.cv.CV_8UC4);
let dst = new window.cv.Mat(height, width, window.cv.CV_8UC1);
let blur = new window.cv.Mat(height, width, window.cv.CV_8UC1);
let bgr = new window.cv.Mat();
let hsv = new window.cv.Mat();
let hls = new window.cv.Mat();
let hsvSplit = new window.cv.MatVector();
let hlsSplit = new window.cv.MatVector();
let bgrSplit = new window.cv.MatVector();

function App() {
  const [isReady, setIsReady] = useState(false);
  const [signal, setSignal] = useState([]);
  const [frameCount, setFrameCount] = useState(0);
  const [fps, setFps] = useState(0);

  const videoRef = useRef(null);

  const chartOptions = (label, dataSrc, color) => {
    let data = {
      labels: range(0, dataSrc.length),
      datasets: [
        {
          label: label,
          fill: false,
          lineTension: 0.4,
          backgroundColor: "rgba(75,192,192,0.4)",
          borderColor: color,
          borderCapStyle: "butt",
          pointRadius: 1,
          pointHitRadius: 10,
          data: dataSrc,
        },
      ],
    };
    return data;
  };

  useEffect(() => {
    if (window.cv && window.cv.imread) {
      setIsReady(true);
    } else {
      window.Module = {
        onRuntimeInitialized: () => {
          setIsReady(true);
        },
      };
    }

    let video = document.getElementById("videoInput"); // video is the id of video tag
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then(function (stream) {
        video.srcObject = stream;
        video.play();
        let cap = new window.cv.VideoCapture(video);

        setInterval(() => {
          processVideo(cap);
        }, 1);

        setInterval(() => {
          setFps(frameCount);
          setFrameCount(0);
        }, 1000);
      })
      .catch(function (err) {
        console.log("An error occurred! " + err);
      });

    return () => {
      src.delete();
      dst.delete();
      blur.delete();
      bgr.delete();
      hsv.delete();
      hls.delete();
      bgrSplit.delete();
      hsvSplit.delete();
      hlsSplit.delete();
    };
  }, []);

  const processVideo = async (videoCapture) => {
    try {
      videoCapture.read(src);
      window.cv.medianBlur(src, blur, 3);
      window.cv.cvtColor(blur, dst, window.cv.COLOR_RGBA2GRAY);
      window.cv.cvtColor(blur, bgr, window.cv.COLOR_RGBA2BGR);
      window.cv.cvtColor(bgr, hsv, window.cv.COLOR_BGR2HSV);
      window.cv.cvtColor(bgr, hls, window.cv.COLOR_BGR2HLS);
      window.cv.split(hsv, hsvSplit);
      window.cv.split(hls, hlsSplit);
      window.cv.split(bgr, bgrSplit);

      let avgArr = [];

      const bgrCh0 = average(bgrSplit.get(0).data);
      const bgrCh1 = average(bgrSplit.get(1).data);
      const bgrCh2 = average(bgrSplit.get(2).data);
      const hlsCh0 = average(hlsSplit.get(0).data);
      const hlsCh1 = average(hlsSplit.get(1).data);
      const hlsCh2 = average(hlsSplit.get(2).data);
      const hsvCh0 = average(hsvSplit.get(0).data);
      const hsvCh1 = average(hsvSplit.get(1).data);
      const hsvCh2 = average(hsvSplit.get(2).data);

      avgArr = [
        bgrCh0,
        bgrCh1,
        bgrCh2,
        // hlsCh0,
        // hlsCh1,
        // hlsCh2,
        // hsvCh0,
        // hsvCh1,
        // hsvCh2,
      ];

      arr.push(avgArr);

      console.log(arr.length);

      try {
        if (arr.length > 200) {
          let ica = fastICA(arr.slice(20, arr.length), {
            maxIterations: 1000,
            debug: true,
          });
          console.log(ica.source.map((s) => s[2]));
          setSignal(ica.source.map((s) => s[2]));
        }
      } catch (error) {
        console.error(error);
      }

      // window.cv.imshow("canvasOutput", blur);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <video ref={videoRef} width="640" height="480" id="videoInput" />
      <canvas id="canvasOutput" width="640" height="480"></canvas>
      {isReady && <button onClick={processVideo}>Process Video</button>}
      <div>FPS: {fps}</div>
      <div style={{ height: "400px", width: "400px" }}>
        <Line data={chartOptions("HB", signal, "rgba(167, 0, 100, 1)")} />
      </div>
    </div>
  );
}

export default App;
