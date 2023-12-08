import * as faceapi from "face-api.js";
import React from "react";
import "./App.css";
import { Progress, Button, Icon, Placeholder } from "semantic-ui-react";
import { POS } from "./rppg";

import _ from "lodash";
import { Line } from "react-chartjs-2";
import styled from "styled-components";
import { initCamera, toRGB } from "./utils";
import { mean } from "mathjs";
import AnimatedNumbers from "react-animated-numbers";

let blur = new window.cv.Mat();

const Chart = styled.div`
  ${"" /* height: 500px; */}
  width: 30vw;
`;

const SIGNAL_WINDOW = 64;

const defaultState = {
  loaded: false,
  ppg: [],
  bpm: -1,
  ws: null,
  counter: 0,
  done: false,
  started: false,
  signal: new Array(2 * SIGNAL_WINDOW).fill({
    time: 0,
    R: 0,
    B: 0,
    G: 0,
  }),
  rr: -1,
};

async function initFaceApi() {
  await faceapi.nets.ssdMobilenetv1.loadFromUri("/weights");
  await faceapi.nets.faceRecognitionNet.loadFromUri("/weights");
  await faceapi.nets.faceLandmark68Net.loadFromUri("/weights");
}

class App extends React.Component {
  counter = 0;
  state = defaultState;

  async componentDidMount() {
    console.log("Loading assets");
    window.faceapi = faceapi;
    this.video = document.getElementById("inputVideo");
    this.canvas = document.getElementById("overlay");

    console.log("All Assets Loaded");
    await initFaceApi();
    initCamera(this.video);
    // this.video.addEventListener("playing", () => {
    // this.onPlay();
    // console.log("Playing");
    // });

    // Connect to WebSocket server
    const ws = new WebSocket("wss://rppg-stanford-backend.fly.dev/ws");
    ws.onopen = () => {
      console.log("Connected to the WebSocket server");
    };
    ws.onmessage = (event) => {
      // todo;
      console.log(typeof event.data);
      const data = JSON.parse(event.data);
      if (data.bpm !== -1) {
        this.setState({ bpm: data.bpm, done: true });
      } else {
        this.setState({ ppg: data.graph });
      }
    };
    this.setState({ loaded: true, ws });
  }

  onPlay = async () => {
    let R = [],
      G = [],
      B = [];
    let results = await faceapi.detectAllFaces(this.video);
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
      var signal = this.state.signal;
      signal.push({
        R,
        G,
        B,
      });
      signal.shift();
      this.state.ws.send(JSON.stringify({ data: _signal }));
      this.setState({ counter: this.state.counter + 1 });
    }
    if (!this.state.done) {
      setTimeout(() => {
        this.onPlay();
      });
    } else {
      let out = POS(this.state.signal, SIGNAL_WINDOW);
      console.log({ out });
      this.setState({
        rr: out[3],
      });
    }
  };

  chartOptions = (label, dataSrc, color) => {
    let data = {
      labels: _.range(0, 500),
      datasets: [
        {
          label: label,
          fill: false,
          lineTension: 0.4,
          backgroundColor: "rgba(255, 58, 58, 1)",
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
    return (
      <div className="App">
        <div className="innerContainer">
          <div className="videoContainer">
            <div className="title">
              <div>Remote Photoplethysmography Demo</div>
              {this.state.done && (
                <Button
                  size="small"
                  primary
                  onClick={() => {
                    this.setState(defaultState);
                    this.onPlay();
                    this.setState({ started: true });
                  }}
                  icon
                  labelPosition="right"
                  positive
                >
                  Re-take
                  <Icon name="right arrow" />
                </Button>
              )}
              {!this.state.started && (
                <Button
                  size="small"
                  primary
                  onClick={() => {
                    this.onPlay();
                    this.setState({ started: true });
                  }}
                  icon
                  labelPosition="right"
                  positive
                >
                  Start
                  <Icon name="right arrow" />
                </Button>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <video
                id="inputVideo"
                height="500px"
                width={`${window.innerWidth * 0.58}px`}
                autoPlay
                muted
              ></video>
              <canvas
                id="overlay"
                style={{ position: "relative", marginTop: "-900px" }}
              />
            </div>
            <div style={{ width: "97%" }}>
              <Progress
                progress
                fluid
                percent={this.state.counter / 10}
                indicating
              >
                {this.state.started
                  ? this.state.counter < 1000
                    ? "Calculating.."
                    : "Done"
                  : ""}
              </Progress>
            </div>
          </div>
          <div className="chartContainer">
            <Chart>
              <Line
                data={this.chartOptions(
                  "PPG Signal",
                  this.state.ppg,
                  "rgb(255, 58, 58)"
                )}
              />
            </Chart>
            <div className="metric-outer-container">
              <div className="metric-title">Heart Rate</div>
              {this.state.bpm !== -1 ? (
                <div className="metric-inner-container">
                  <span className="metric">{this.state.bpm.toFixed(0)}</span>
                  <span className="units">bpm</span>
                </div>
              ) : (
                <Placeholder>
                  <Placeholder.Line length="very short" />
                </Placeholder>
              )}
            </div>
            <div className="metric-outer-container">
              <div className="metric-title title-blue">Respiratory Rate</div>
              {this.state.bpm !== -1 ? (
                <div className="metric-inner-container">
                  <span className="metric">{this.state.rr.toFixed(0)}</span>
                  <span className="units">bpm</span>
                </div>
              ) : (
                <Placeholder>
                  <Placeholder.Line length="very short" />
                </Placeholder>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
