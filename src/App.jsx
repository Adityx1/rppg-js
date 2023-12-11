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
import { average } from "./utils";
import { POS } from "./rppg";

import _ from "lodash";
import { Line } from "react-chartjs-2";
import { initCamera, toRGB } from "./utils";
import { BlockMath, InlineMath } from "react-katex";
import { mean } from "mathjs";

const SIGNAL_WINDOW = 64;

let bgr = new window.cv.Mat();
let hsv = new window.cv.Mat();
let hls = new window.cv.Mat();
let hsvSplit = new window.cv.MatVector();
let hlsSplit = new window.cv.MatVector();
let bgrSplit = new window.cv.MatVector();

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
    const ws = new WebSocket("ws://localhost:8000/ws");
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
      window.cv.cvtColor(this.state.blur, bgr, window.cv.COLOR_RGBA2BGR);
      window.cv.cvtColor(bgr, hsv, window.cv.COLOR_BGR2HSV);
      window.cv.cvtColor(bgr, hls, window.cv.COLOR_BGR2HLS);
      window.cv.split(hsv, hsvSplit);
      window.cv.split(hls, hlsSplit);
      window.cv.split(bgr, bgrSplit);

      const bgrCh0 = average(bgrSplit.get(0).data);
      const bgrCh1 = average(bgrSplit.get(1).data);
      const bgrCh2 = average(bgrSplit.get(2).data);
      const hlsCh0 = average(hlsSplit.get(0).data);
      const hlsCh1 = average(hlsSplit.get(1).data);
      const hlsCh2 = average(hlsSplit.get(2).data);
      const hsvCh0 = average(hsvSplit.get(0).data);
      const hsvCh1 = average(hsvSplit.get(1).data);
      const hsvCh2 = average(hsvSplit.get(2).data);

      const avgArr = [
        bgrCh0,
        bgrCh1,
        bgrCh2,
        hlsCh0,
        hlsCh1,
        hlsCh2,
        hsvCh0,
        hsvCh1,
        hsvCh2,
      ];

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
      this.state.ws.send(JSON.stringify({ data: avgArr }));
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
            <div className="title">
              The model for remote photoplethysmography
            </div>
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
              the <InlineMath>{"k^{th}"}</InlineMath> skin pixel at time{" "}
              <InlineMath>t</InlineMath>; <InlineMath> I(t) </InlineMath>
              is the luminance intensity, absorbing changes due to the light
              source and the varying distances between the light source, skin,
              and camera. In the dichromatic model,{" "}
              <InlineMath> I(t)</InlineMath> is influenced by two types of
              reflections: specular (<InlineMath>v_s(t)</InlineMath>) and
              diffuse (<InlineMath>v_d(t)</InlineMath>). These reflections
              change over time due to body movements and the pulsating nature of
              blood flow. The term <InlineMath>v_n(t)</InlineMath> accounts for
              the camera sensor's quantization noise.
            </p>
            <p>
              Specular reflection (<InlineMath>v_s(t)</InlineMath>) is akin to a
              mirror-like reflection from the skin's surface and does not carry
              pulsatile information. Its spectral composition mirrors that of
              the light source and changes with body movements, affecting the
              geometry of the light source, skin, and camera. Specular
              reflection is defined as:
            </p>
            <BlockMath>v_s(t) = u_s \cdot (s_0 + s(t)),</BlockMath>
            <p>
              where <InlineMath>u_s </InlineMath> is the unit color vector of
              the light spectrum, <InlineMath>s_0</InlineMath> is the constant
              component, and <InlineMath>s(t)</InlineMath> represents the
              motion-induced variable component of specular reflections.
            </p>
            <p>
              Diffuse reflection (<InlineMath>v_d(t)</InlineMath>), on the other
              hand, results from light absorption and scattering within the skin
              tissues. Influenced by the concentration of hemoglobin and
              melanin, it has a distinct chromaticity and varies with blood
              volume changes, thus being time-dependent. It is expressed as:
            </p>
            <BlockMath>v_d(t) = u_d \cdot d_0 + u_p \cdot p(t),</BlockMath>
            <p>
              where <InlineMath>u_d</InlineMath> is the unit color vector for
              skin tissue, <InlineMath>d_0</InlineMath> represents the constant
              reflection strength, <InlineMath>u_p</InlineMath> the relative
              pulsatile strengths in the RGB channels, and{" "}
              <InlineMath>p(t)</InlineMath> the pulse signal. Integrating these
              reflections into the initial equation, we get:
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
              where <InlineMath>u_c</InlineMath> is the unit color vector for
              skin reflection and <InlineMath>c_0</InlineMath> the reflection
              strength. Thus, the equation is reformulated as:
            </p>
            <BlockMath>
              C_k(t) = I_0 \cdot (1 + i(t)) \cdot (u_c \cdot c_0 + u_s \cdot
              s(t) + u_p \cdot p(t)) + v_n(t),
            </BlockMath>
            <p>
              Here, <InlineMath>I(t)</InlineMath> is decomposed into a
              stationary part <InlineMath>I_0</InlineMath> and a time-varying
              part <InlineMath>I_0 \cdot i(t)</InlineMath>, where{" "}
              <InlineMath> i(t), s(t) </InlineMath>, and{" "}
              <InlineMath>p(t)</InlineMath> are signals with zero mean. It's
              important to note that specular reflection can be the predominant
              component, potentially overshadowing other elements. We assume the
              existence of methods (like a skin classifier) to mitigate areas
              where specular reflection is dominant.
            </p>
          </div>
          <div className="section">
            <img src="/media/img/model.png" alt="Reflectance Model" />
            <div className="caption">Figure 1. The Reflectance Model.</div>
          </div>
          <div className="section">
            <div className="title">Blind Source Separation</div>
            <p>
              Independent Component Analysis (ICA) is a comparatively novel
              method for extracting independent signals from a collection of
              observations. These observations are typically linear combinations
              of fundamental source signals [3]. In this application, the focus
              is on the Blood Volume Pulse (BVP), which circulates throughout
              the human body. The cardiac cycle influences the volume of blood
              vessels in the face, altering the path of incident light. This
              alteration affects the reflected light, revealing the timing of
              cardiovascular activities. By capturing a video of the face using
              a standard webcam, the red, green, and blue (RGB) sensors detect a
              blend of the reflected plethysmographic signal and other light
              fluctuations caused by various artifacts. Considering the
              different absorptivity rates of hemoglobin across the visible and
              near-infrared spectrum [4], each RGB sensor captures a unique
              combination of the original signals, with varying weights. These
              captured signals from the RGB sensors are represented as{" "}
              <InlineMath>y1(t), y2(t), </InlineMath> and{" "}
              <InlineMath> y3(t),</InlineMath> indicating the signal amplitudes
              at any given time <InlineMath>t</InlineMath>. The model
              hypothesizes the existence of three primary source signals:{" "}
              <InlineMath> x1(t), x2(t),</InlineMath> and{" "}
              <InlineMath> x3(t)</InlineMath>. According to the ICA framework,
              the observed signals are linear combinations of these source
              signals, expressed as:
            </p>
            <BlockMath>y(t) = Ax(t)</BlockMath>
            <p>
              Here, the vectors{" "}
              <InlineMath>y(t) = [y1(t), y2(t), y3(t)]^T </InlineMath> and{" "}
              <InlineMath> x(t) = [x1(t), x2(t), x3(t)]^T </InlineMath>, while
              the <InlineMath>3x3</InlineMath> matrix <InlineMath>A</InlineMath>{" "}
              contains the coefficients of the mixtures. The objective of ICA is
              to determine a demixing matrix <InlineMath>W</InlineMath>, which
              approximates the inverse of <InlineMath>A</InlineMath>. The output
              of this process,
            </p>
            <BlockMath>{"\\hat{x}(t) = Wy(t)"}</BlockMath>
            <p>
              provides an estimation of the vector <InlineMath>x(t)</InlineMath>
              , which encompasses the underlying source signals.
            </p>
          </div>
          <div className="section">
            <img src="/media/img/outline.png" alt="Reflectance Model" />
            <div className="caption">
              Figure 2. Face detection is performed on the video frames,
              resulting in the red bounding box on the face. Next, regions of
              interest (ROIs) such as the cheeks marked by the black boxes are
              selected within the face box. The rPPG signal is extracted from
              the pixels within the ROIs. Lastly, post-processing techniques,
              such as frequency analysis (e.g., Fourier transform) and peak
              detection, are applied on the extracted signal to estimate HR.
            </div>
          </div>
          <div className="section">
            <p>
              To perform remote heart rate (HR) measurement, we adhere to a
              process similar to what is depicted in Figure 2. The procedure
              begins with a digital camera recording a video of the individual.
              Subsequently, a facial recognition algorithm, like the{" "}
              <a href="https://github.com/justadudewhohacks/face-api.js">
                68 face landmark net
              </a>
              , is employed to determine the facial bounding box coordinates.
              Following this, specific regions of interest (ROIs) on the face,
              such as the cheeks, are chosen for their strong signal presence.
              The pixel data from these ROIs are then utilized for remote
              photoplethysmography (rPPG) signal extraction. The final step in
              estimating the HR involves additional post-processing, which
              generally includes frequency analysis and the identification of
              signal peaks.
            </p>
          </div>
          <div className="section">
            <div className="title">Plane Orthogonal To Skin (POS)</div>
            <p>
              The plane-orthogonal-to-skin (POS) method uses the plane
              orthogonal to the skin tone in the RGB signal to extract the rPPG
              signal. The method is described in detail in [1].
            </p>
          </div>
          <div className="section">
            <img src="/media/img/pos-algorithm.png" className="small" />
            <div className="caption">
              Figure 3. Plane-Orthogonal-To-Skin Algorithm.
            </div>
          </div>
          <div className="references section">
            <div className="title">References</div>
            <div className="reference">
              [1] Wang, W., den Brinker, A. C., Stuijk, S., & de Haan, G.
              (2017). Algorithmic principles of remote-PPG. IEEE Transactions on
              Biomedical Engineering, 64(7), 1479-1491. Article 7565547.
              https://doi.org/10.1109/TBME.2016.2609282
            </div>
            <div className="reference">
              [2] Cheng, Chun-Hong & Wong, Kwan-Long & Chin, Jing-Wei & Chan,
              Tsz Tai & So, Richard. (2021). Deep Learning Methods for Remote
              Heart Rate Measurement: A Review and Future Research Agenda.
              Sensors. 21. 6296. 10.3390/s21186296.
            </div>
            <div className="reference">
              [3] P. Comon, “Independent component analysis, a new concept?”
              Signal Process., vol. 36, pp. 287–314, 1994.
            </div>
            <div className="reference">
              [4] W. G. Zijlstra, A. Buursma, and W. P. Meeuwsen-van der Roest,
              “Absorption spectra of human fetal and adult oxyhemoglobin,
              deoxyhemoglobin, carboxyhemoglobin, and methemoglobin,” Clin.
              Chem., vol. 37, pp. 1633–1638, Sep. 1991.
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
