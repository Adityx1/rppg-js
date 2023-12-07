import * as faceapi from "face-api.js";
import React from "react";
import "./App.css";
// import { POS } from "./rppg";

import _ from "lodash";
import { Bar, Line } from "react-chartjs-2";
import styled from "styled-components";
import { initCamera, toRGB } from "./utils";
import { mean } from "mathjs";

let dst = new window.cv.Mat();
let blur = new window.cv.Mat();

const Chart = styled.div`
  height: 200px;
  width: 30vw;
`;

const ChartDiv = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  width: 100vw;
`;

const ColDiv = styled.div`
  display: flex;
  flex-direction: column;
  text-align: center;
`;

async function initFaceApi() {
  await faceapi.nets.ssdMobilenetv1.loadFromUri("/weights");
  await faceapi.nets.faceRecognitionNet.loadFromUri("/weights");
  await faceapi.nets.faceLandmark68Net.loadFromUri("/weights");
}

class App extends React.Component {
  counter = 0;
  signalWindow = 64;
  state = {
    loaded: false,
    signal: new Array(2 * this.signalWindow).fill({
      time: 0,
      R: 0,
      B: 0,
      G: 0,
    }),
    H: new Array(2 * this.signalWindow).fill(0),
    spectrum: {
      freq: new Array(this.signalWindow).fill(0),
      values: new Array(this.signalWindow).fill(0),
    },
    bpm: -1,
    ws: null,
  };

  async componentDidMount() {
    console.log("Loading assets");
    window.faceapi = faceapi;
    this.video = document.getElementById("inputVideo");
    this.canvas = document.getElementById("overlay");

    console.log("All Assets Loaded");
    await initFaceApi();
    initCamera(this.video);
    this.video.addEventListener("playing", () => {
      this.onPlay();
      console.log("Playing");
    });

    // Connect to WebSocket server
    const ws = new WebSocket("ws://localhost:8000/ws");
    ws.onopen = () => {
      console.log("Connected to the WebSocket server");
    };
    ws.onmessage = (event) => {
      // todo;
      console.log(event.data);
    };
    this.setState({ loaded: true, ws });
  }

  onPlay = async () => {
    let R = [],
      G = [],
      B = [];
    const start = Date.now();
    let results = await faceapi.detectAllFaces(this.video);
    const end = Date.now() - start;
    if (results.length > 0) {
      const dims = faceapi.matchDimensions(this.canvas, this.video, true);
      results = faceapi.resizeResults(results, dims);
      const canvases = await faceapi.extractFaces(this.video, results);
      faceapi.draw.drawDetections(this.canvas, results);

      const res = canvases[0]
        .getContext("2d")
        .getImageData(0, 0, canvases[0].width, canvases[0].height);

      let src = window.cv.matFromImageData(res);

      window.cv.medianBlur(src, blur, 3);
      let imgData = new ImageData(
        new Uint8ClampedArray(blur.data),
        blur.cols,
        blur.rows
      );

      var out = toRGB(imgData.data, imgData.width, imgData.height);
      R = mean(out[0]);
      G = mean(out[1]);
      B = mean(out[2]);
      const _signal = [B, G, R];
      console.log("[signal]", _signal);
      var signal = this.state.signal;
      this.state.ws.send(JSON.stringify({ data: _signal }));
      signal.push(_signal);
      signal.shift();
      this.counter++;
    }
    setTimeout(() => {
      this.onPlay();
    });
  };

  chartOptions = (label, dataSrc, color) => {
    let data = {
      labels: _.range(0, 2 * this.signalWindow),
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

  render() {
    let fftData = {
      labels: this.state.spectrum.freq,
      datasets: [
        {
          label: "FFT",
          barPercentage: 0.5,
          barThickness: 6,
          maxBarThickness: 8,
          minBarLength: 2,
          data: this.state.spectrum.values,
        },
      ],
    };
    return (
      <div>
        <div className="App">
          <div style={{ position: "relative" }}>
            <video
              id="inputVideo"
              height="500px"
              width="900px"
              autoPlay
              muted
            ></video>
            <canvas
              id="overlay"
              style={{ position: "relative", marginTop: "-900px" }}
            />
          </div>

          <ColDiv>
            <Chart>
              <Line
                data={this.chartOptions(
                  "HB",
                  this.state.H,
                  "rgba(167, 0, 100, 1)"
                )}
              />
            </Chart>
            <Chart>
              <Bar data={fftData} />
            </Chart>
          </ColDiv>
        </div>
        <ChartDiv>
          <Chart>
            <Line
              data={this.chartOptions(
                "Red",
                this.state.signal.map((s) => s["R"]),
                "rgba(255,0,0,1)"
              )}
            />
          </Chart>
          <Chart>
            <Line
              data={this.chartOptions(
                "Green",
                this.state.signal.map((s) => s["G"]),
                "rgba(0,255,110,1)"
              )}
            />
          </Chart>
          <Chart>
            <Line
              data={this.chartOptions(
                "Blue",
                this.state.signal.map((s) => s["B"]),
                "rgba(0,0,255,1)"
              )}
            />
          </Chart>
        </ChartDiv>
      </div>
    );
  }
}

export default App;
