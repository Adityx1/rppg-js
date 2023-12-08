import * as faceapi from "face-api.js";
import React from "react";
import "./App.css";
import {
  Progress,
  Button,
  Icon,
  Placeholder,
  Modal,
  List,
} from "semantic-ui-react";
import { POS } from "./rppg";

import _ from "lodash";
import { Line } from "react-chartjs-2";
import { initCamera, toRGB } from "./utils";
import { mean } from "mathjs";

const SIGNAL_WINDOW = 64;

const defaultState = {
  loaded: false,
  ppg: [],
  bpm: -1,
  bpm2: -1,
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
  blur: null,
  socketConnected: false,
  mobilePermissionsGranted: false,
  openInstructionsModal: false,
};

async function initFaceApi() {
  await faceapi.nets.ssdMobilenetv1.loadFromUri("/weights");
  await faceapi.nets.faceRecognitionNet.loadFromUri("/weights");
  await faceapi.nets.faceLandmark68Net.loadFromUri("/weights");
}

function isMobileBrowser() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;

  // Checks for iOS devices
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return true;
  }

  // Checks for Android devices
  if (/android/i.test(userAgent)) {
    return true;
  }

  return false;
}

class App extends React.Component {
  counter = 0;
  state = defaultState;

  initialize = async () => {
    console.log("Loading assets");
    window.faceapi = faceapi;
    this.video = document.getElementById("inputVideo");
    this.canvas = document.getElementById("overlay");

    console.log("All Assets Loaded");
    await initFaceApi();

    // Connect to WebSocket server
    const ws = new WebSocket("wss://rppg-stanford-backend.fly.dev/ws");
    ws.onopen = () => {
      console.log("Connected to the WebSocket server");
      this.setState({ socketConnected: true });
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.bpm !== -1) {
        this.setState({ bpm: data.bpm, done: true });
      } else {
        this.setState({ ppg: data.graph });
      }
    };
    this.setState({ loaded: true, ws, blur: new window.cv.Mat() });
  };

  async componentDidMount() {
    if (!isMobileBrowser()) {
      const video = document.getElementById("inputVideo");
      await initCamera(video);
      this.initialize();
    }
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

      window.cv.medianBlur(src, this.state.blur, 3);
      let imgData = new ImageData(
        new Uint8ClampedArray(this.state.blur.data),
        this.state.blur.cols,
        this.state.blur.rows
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
        bpm2: out[2],
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
        <Modal
          open={this.state.openInstructionsModal}
          onClose={() => {
            this.setState({
              openInstructionsModal: false,
            });
          }}
          closeIcon
        >
          <Modal.Header>Instructions</Modal.Header>
          <Modal.Content>
            <List bulleted>
              <List.Item>
                Be in a well lit environment with a light source directly on
                your face.
              </List.Item>
              <List.Item>Be static during the recording.</List.Item>
              <List.Item>
                Place your face as close to the camera as possible.{" "}
              </List.Item>
            </List>
          </Modal.Content>
        </Modal>
        <div className="innerContainer">
          <div className="videoContainer">
            <div className="title">
              <div>Remote Photoplethysmography Demo</div>
              <div className="action">
                <Button
                  basic
                  size="small"
                  onClick={() => {
                    this.setState({
                      openInstructionsModal: true,
                    });
                  }}
                >
                  Instructions
                </Button>
                {isMobileBrowser() && !this.state.mobilePermissionsGranted && (
                  <Button
                    size="small"
                    primary
                    onClick={async () => {
                      const video = document.getElementById("inputVideo");
                      await initCamera(video);
                      await this.initialize();
                      this.setState({ mobilePermissionsGranted: true });
                    }}
                    icon
                    labelPosition="right"
                    secondary
                  >
                    Provide Permissions
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
                    loading={!this.state.socketConnected || !this.state.loaded}
                  >
                    Start
                    <Icon name="right arrow" />
                  </Button>
                )}
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <video
                id="inputVideo"
                height={`${
                  window.innerWidth > 600
                    ? window.innerHeight * 0.5
                    : window.innerHeight * 0.4
                }px`}
                width={`${
                  window.innerWidth > 600
                    ? window.innerWidth * 0.58
                    : window.innerWidth * 0.9
                }px`}
                autoPlay
                muted
                playsInline
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
            <div className="chart">
              <Line
                data={this.chartOptions(
                  "PPG Signal",
                  this.state.ppg,
                  "rgb(255, 58, 58)"
                )}
              />
            </div>
            <div className="metric-outer-container">
              <div className="metric-title">
                Heart Rate (PPG Peak Detection)
              </div>
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
              <div className="metric-title">Heart Rate (POS)</div>
              {this.state.bpm !== -1 ? (
                <div className="metric-inner-container">
                  <span className="metric">{this.state.bpm2.toFixed(0)}</span>
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
