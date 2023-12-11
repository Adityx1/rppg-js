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
import { BlockMath, InlineMath } from "react-katex";
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
    this.video = document.getElementById("inputVideo");
    this.canvas = document.getElementById("overlay");

    console.log("All Assets Loaded");

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
    console.log("Loading assets");
    window.faceapi = faceapi;
    await initFaceApi();
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
        <div className="docs">
          <div className="section">
            <div className="title">The model for rPPG</div>
            <p>
              In order to gain a comprehensive understanding of the techniques
              used for extracting pulses in remote photoplethysmography (rPPG),
              it's essential to begin with a foundational rPPG model. This model
              incorporates key optical and physiological aspects of skin
              reflectance. By employing this model, we can delve deeply into the
              specific challenges encountered in this field and explore the
              various ways these challenges are tackled in different rPPG
              approaches. Imagine a scenario where human skin, imbued with
              pulsating blood, is illuminated by a light source, and a distant
              color camera captures this scene, as depicted in Figure 1. It's
              assumed here that the light source emits light of a consistent
              spectral quality, though its intensity may fluctuate. The
              intensity captured by the camera is influenced by the distance
              between the light source, the skin, and the camera's sensor. The
              skin's appearance, as recorded by the camera, displays a
              particular color that undergoes temporal variations. These
              variations are a result of both the movement-induced changes in
              intensity and specular reflections, as well as the subtle color
              shifts caused by the pulse. The degree of these temporal changes
              is directly linked to the level of luminance intensity.
            </p>
            <p>
              Utilizing the dichromatic reflection model, we can articulate the
              reflection of each skin pixel in a recorded image sequence as a
              function that varies over time within the RGB color space. This
              function is expressed as:
            </p>
            <BlockMath>
              C_k(t) = I(t) \cdot (v_s(t) + v_d(t)) + v_n(t),
            </BlockMath>
            <p>
              where <InlineMath>C_k(t)</InlineMath> represents the RGB values of
              the k-th skin pixel at time t; \( I(t) \) is the luminance
              intensity, absorbing changes due to the light source and the
              varying distances between the light source, skin, and camera. In
              the dichromatic model, \( I(t) \) is influenced by two types of
              reflections: specular (\( v_s(t) \)) and diffuse (\( v_d(t) \)).
              These reflections change over time due to body movements and the
              pulsating nature of blood flow. The term \( v_n(t) \) accounts for
              the camera sensor's quantization noise.
            </p>
            <p>
              Specular reflection (\( v_s(t) \)) is akin to a mirror-like
              reflection from the skin's surface and does not carry pulsatile
              information. Its spectral composition mirrors that of the light
              source and changes with body movements, affecting the geometry of
              the light source, skin, and camera. Specular reflection is defined
              as:
            </p>
            <BlockMath>v_s(t) = u_s \cdot (s_0 + s(t)),</BlockMath>
            <p>
              where \( u_s \) is the unit color vector of the light spectrum, \(
              s_0 \) is the constant component, and \( s(t) \) represents the
              motion-induced variable component of specular reflections.
            </p>
            <p>
              Diffuse reflection (\( v_d(t) \)), on the other hand, results from
              light absorption and scattering within the skin tissues.
              Influenced by the concentration of hemoglobin and melanin, it has
              a distinct chromaticity and varies with blood volume changes, thus
              being time-dependent. It is expressed as:
            </p>
            <BlockMath>v_d(t) = u_d \cdot d_0 + u_p \cdot p(t),</BlockMath>
            <p>
              where \( u_d \) is the unit color vector for skin tissue, \( d_0
              \) represents the constant reflection strength, \( u_p \) the
              relative pulsatile strengths in the RGB channels, and \( p(t) \)
              the pulse signal. Integrating these reflections into the initial
              equation, we get:
            </p>
            <BlockMath>
              C_k(t) = I(t) \cdot (u_s \cdot (s_0 + s(t)) + u_d \cdot d_0 + u_p
              \cdot p(t)) + v_n(t).
            </BlockMath>
            <p>
              The constant components of specular and diffuse reflections can be
              merged into a single term representing the static skin reflection:
            </p>
            <BlockMath>
              u_c \cdot c_0 = u_s \cdot s_0 + u_d \cdot d_0,
            </BlockMath>
            <p>
              where \( u_c \) is the unit color vector for skin reflection and
              \( c_0 \) the reflection strength. Thus, the equation is
              reformulated as:
            </p>
            <BlockMath>
              C_k(t) = I_0 \cdot (1 + i(t)) \cdot (u_c \cdot c_0 + u_s \cdot
              s(t) + u_p \cdot p(t)) + v_n(t),
            </BlockMath>
            <p>
              Here, \( I(t) \) is decomposed into a stationary part \( I_0 \)
              and a time-varying part \( I_0 \cdot i(t) \), where \( i(t) \), \(
              s(t) \), and \( p(t) \) are signals with zero mean. It's important
              to note that specular reflection can be the predominant component,
              potentially overshadowing other elements. We assume the existence
              of methods (like a skin classifier) to mitigate areas where
              specular reflection is dominant.
            </p>
          </div>
          <div className="section">
            <p>
              Independent Component Analysis (ICA) is a comparatively novel
              method for extracting independent signals from a collection of
              observations. These observations are typically linear combinations
              of fundamental source signals [12]. In this research, the focus is
              on the Blood Volume Pulse (BVP), which circulates throughout the
              human body. The cardiac cycle influences the volume of blood
              vessels in the face, altering the path of incident light. This
              alteration affects the reflected light, revealing the timing of
              cardiovascular activities. By capturing a video of the face using
              a standard webcam, the red, green, and blue (RGB) sensors detect a
              blend of the reflected plethysmographic signal and other light
              fluctuations caused by various artifacts. Considering the
              different absorptivity rates of hemoglobin across the visible and
              near-infrared spectrum [13], each RGB sensor captures a unique
              combination of the original signals, with varying weights. These
              captured signals from the RGB sensors are represented as y1(t),
              y2(t), and y3(t), indicating the signal amplitudes at any given
              time t. The model hypothesizes the existence of three primary
              source signals: x1(t), x2(t), and x3(t). According to the ICA
              framework, the observed signals are linear combinations of these
              source signals, expressed as:
            </p>
            <BlockMath>y(t) = Ax(t)</BlockMath>
            <p>
              Here, the vectors y(t) = [y1(t), y2(t), y3(t)]^T and x(t) =
              [x1(t), x2(t), x3(t)]^T, while the 3x3 matrix A contains the
              coefficients of the mixtures. The objective of ICA is to determine
              a demixing matrix W, which approximates the inverse of A. The
              output of this process,
            </p>
            <BlockMath>{"\\hat{x}(t) = Wy(t)"}</BlockMath>
            <p>
              provides an estimation of the vector x(t), which encompasses the
              underlying source signals.
            </p>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
