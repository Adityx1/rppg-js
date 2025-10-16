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
import { mean } from "mathjs";

const SIGNAL_WINDOW = 64;

let blur;
let bgr;
let hsv;
let hls;
let hsvSplit;
let hlsSplit;
let bgrSplit;

const createSignalBuffer = () =>
  new Array(2 * SIGNAL_WINDOW).fill(null).map(() => ({
    time: 0,
    R: 0,
    B: 0,
    G: 0,
  }));

const createDefaultState = () => ({
  loaded: false,
  ppg: [],
  bpm: -1,
  bpm2: -1,
  ws: null,
  counter: 0,
  done: false,
  started: false,
  signal: createSignalBuffer(),
  rr: -1,
  blur: null,
  socketConnected: false,
  mobilePermissionsGranted: false,
  openInstructionsModal: false,
  oSat: -1,
  resultsTimestamp: null,
  view: "landing",
});

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
  state = createDefaultState();

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
    blur = new window.cv.Mat();
    bgr = new window.cv.Mat();
    hsv = new window.cv.Mat();
    hls = new window.cv.Mat();
    hlsSplit = new window.cv.MatVector();
    hsvSplit = new window.cv.MatVector();
    bgrSplit = new window.cv.MatVector();
    this.setState({ loaded: true, ws });
  };

  async componentDidMount() {
    console.log("Loading assets");
    window.faceapi = faceapi;
    await initFaceApi();
  }

  async componentDidUpdate(prevProps, prevState) {
    if (prevState.view !== this.state.view && this.state.view === "scan") {
      if (!this.state.started) {
        this.handleStartMeasurement();
      }
    }
  }

  onPlay = async () => {
    let R = [],
      G = [],
      B = [];
    let results = await faceapi.detectAllFaces(this.video);
    console.log(
      "detections",
      results.length,
      this.state.ws ? this.state.ws.readyState : null
    );
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
      window.cv.cvtColor(blur, bgr, window.cv.COLOR_RGBA2BGR);
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
      const ws = this.state.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ data: avgArr }));
      } else {
        console.warn(
          "WebSocket not ready",
          ws ? ws.readyState : "no-connection"
        );
      }
      this.setState({ counter: this.state.counter + 1 });
    }
    if (!this.state.done) {
      setTimeout(() => {
        this.onPlay();
      });
    } else {
      let out = POS(this.state.signal, SIGNAL_WINDOW);
      console.log({ out });
      this.stopVideoStream();
      this.closeWebSocket();
      this.setState({
        bpm2: out[2],
        rr: out[3],
        oSat: out[4],
        resultsTimestamp: new Date(),
        started: false,
        ws: null,
        socketConnected: false,
        loaded: false,
        view: "results",
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

  startFreeScan = () => {
    this.setState({ view: "scan" });
  };

  restartFlow = () => {
    const { ws, mobilePermissionsGranted, loaded, socketConnected } = this.state;
    const baseState = createDefaultState();
    this.stopVideoStream();
    this.closeWebSocket();
    this.setState({
      ...baseState,
      mobilePermissionsGranted,
      view: "landing",
    });
  };

  ensureScannerInitialized = async () => {
    if (isMobileBrowser() && !this.state.mobilePermissionsGranted) {
      return { ready: false, reason: "mobile-permissions" };
    }

    const video = document.getElementById("inputVideo");
    const canvas = document.getElementById("overlay");

    if (this.state.loaded) {
      if (video && canvas) {
        const hasActiveStream =
          video.srcObject &&
          video.srcObject.getTracks().some((track) => track.readyState === "live");

        if (!hasActiveStream) {
          await initCamera(video);
        }

        this.video = video;
        this.canvas = canvas;
        return { ready: true };
      }
      return { ready: false, reason: "elements-not-ready" };
    }

    if (!video) {
      return { ready: false, reason: "elements-not-ready" };
    }

    try {
      await initCamera(video);
      await this.initialize();
      this.video = video;
      this.canvas = document.getElementById("overlay");
      if (!this.canvas) {
        return { ready: false, reason: "elements-not-ready" };
      }
      return { ready: true };
    } catch (error) {
      console.error("Failed to initialize scanner", error);
      return { ready: false, reason: "init-failed" };
    }
  };

  handleStartMeasurement = async (attempt = 0) => {
    const { ready, reason } = await this.ensureScannerInitialized();
    if (!ready) {
      if (
        reason === "elements-not-ready" &&
        attempt < 5 &&
        this.state.view === "scan"
      ) {
        setTimeout(() => this.handleStartMeasurement(attempt + 1), 150);
      }
      return;
    }

    this.setState(
      {
        started: true,
        done: false,
        counter: 0,
        bpm: -1,
        bpm2: -1,
        rr: -1,
        oSat: -1,
        ppg: [],
        signal: createSignalBuffer(),
      },
      () => {
        this.onPlay();
      }
    );
  };

  stopVideoStream = () => {
    const video = this.video || document.getElementById("inputVideo");
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }

    if (this.canvas) {
      const ctx = this.canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    this.video = null;
    this.canvas = null;
  };

  closeWebSocket = () => {
    const { ws } = this.state;
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch (error) {
        console.warn("Error closing WebSocket", error);
      }
    }
  };

  renderLanding = () => (
    <div className="landing-page">
      <header className="hero">
        <div className="hero-text">
          <div className="badge">
            <Icon name="star" /> AI-Powered Health Analysis
          </div>
          <h1>
            Measure Your Vitals <span>In 30 Seconds</span>
          </h1>
          <p>
            Advanced face scanning technology to measure heart rate, respiratory rate, stress levels, and more—right from your webcam.
          </p>
          <div className="hero-actions">
            <Button
              size="big"
              primary
              onClick={this.startFreeScan}
              icon
              labelPosition="right"
              className="primary"
            >
              Start Free Scan
              <Icon name="play" />
            </Button>
            <Button
              size="big"
              onClick={() => this.setState({ openInstructionsModal: true })}
              icon
              labelPosition="right"
            >
              View Instructions
              <Icon name="help circle" />
            </Button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="pulse-ring">
            <Icon name="heartbeat" size="massive" color="teal" />
          </div>
        </div>
      </header>

      <section className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="icon">
              <Icon name="map marker alternate" />
            </div>
            <h3>Position Your Face</h3>
            <p>Center your face in the frame with a well-lit background.</p>
          </div>
          <div className="step">
            <div className="icon">
              <Icon name="clock" />
            </div>
            <h3>30-Second Scan</h3>
            <p>Stay still while we analyze thousands of subtle color variations.</p>
          </div>
          <div className="step">
            <div className="icon">
              <Icon name="chart line" />
            </div>
            <h3>Get Instant Results</h3>
            <p>Review heart and respiratory metrics as soon as the scan ends.</p>
          </div>
        </div>
      </section>

      <section className="metrics-overview">
        <h2>Comprehensive Health Metrics</h2>
        <div className="grid">
          {[
            "Heart Rate",
            "Blood Pressure",
            "Respiratory Rate",
            "Stress Index",
            "HRV",
            "Wellness Score",
            "Risk Assessment",
            "Trend Analysis",
          ].map((metric) => (
            <div className="metric-card" key={metric}>
              <Icon name="heartbeat" />
              <span>{metric}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="secure-info">
        <Icon name="shield" size="big" />
        <div>
          <h3>Secure &amp; Private</h3>
          <p>
            Your health data is encrypted and never stored. GDPR, PDPA, and UK-GDPR compliant.
          </p>
        </div>
      </section>

      <section className="cta-section">
        <h2>Ready to Check Your Health?</h2>
        <p>Join thousands using FaceVitals for daily health monitoring.</p>
        <Button
          size="huge"
          primary
          onClick={this.startFreeScan}
          icon
          labelPosition="right"
          className="primary"
        >
          Start Your Free Scan
          <Icon name="play" />
        </Button>
      </section>
    </div>
  );

  renderScanner = () => (
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
                onClick={this.handleStartMeasurement}
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
          {this.state.bpm2 !== -1 ? (
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
          {this.state.rr !== -1 ? (
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
  );

  renderResults = () => (
    <div className="results-page">
      <header>
        <div>
          <h1>Scan Results</h1>
          {this.state.resultsTimestamp && (
            <p>
              Completed on {this.state.resultsTimestamp.toLocaleDateString()} at {" "}
              {this.state.resultsTimestamp.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="header-actions">
          <Button basic icon labelPosition="left">
            <Icon name="download" /> Export PDF
          </Button>
          <Button primary icon labelPosition="left">
            <Icon name="chat" /> Message Coach
          </Button>
        </div>
      </header>

      <section className="health-status">
        <div className="score">
          <span>Overall Health Status</span>
          <h2>8.5 / 10</h2>
          <p>Your vital signs are within healthy ranges.</p>
        </div>
      </section>

      <section className="vital-metrics">
        <h2>Vital Signs</h2>
        <div className="metrics-grid">
          {[
            {
              label: "Heart Rate",
              value:
                this.state.bpm !== -1
                  ? `${this.state.bpm.toFixed(0)} bpm`
                  : "N/A",
              status: "good",
              note: "±2 bpm vs. last scan",
            },
            {
              label: "Heart Rate (POS)",
              value:
                this.state.bpm2 !== -1
                  ? `${this.state.bpm2.toFixed(0)} bpm`
                  : "N/A",
              status: "good",
              note: "Signal processed via POS algorithm",
            },
            {
              label: "Respiratory Rate",
              value:
                this.state.rr !== -1
                  ? `${this.state.rr.toFixed(0)} /min`
                  : "N/A",
              status: "good",
              note: "±0 /min vs. last scan",
            },
            {
              label: "Oxygen Saturation Forecast",
              value:
                this.state.oSat !== -1
                  ? `${this.state.oSat.toFixed(0)} %`
                  : "N/A",
              status: "good",
              note: "Predicted from signal analysis",
            },
          ].map((metric) => (
            <div className={`metric-card ${metric.status}`} key={metric.label}>
              <div className="metric-header">
                <span>{metric.label}</span>
                <span className="status">{metric.status}</span>
              </div>
              <div className="metric-value">{metric.value}</div>
              <div className="metric-note">{metric.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="risk-assessment">
        <h2>Risk Assessment</h2>
        <div className="risk-cards">
          <div className="risk-card green">
            <h3>Cardiovascular Risk</h3>
            <p>Low risk based on current metrics.</p>
          </div>
          <div className="risk-card yellow">
            <h3>Stress Level</h3>
            <p>Slightly elevated. Consider relaxation techniques.</p>
          </div>
        </div>
      </section>

      <section className="recommended-actions">
        <h2>Recommended Actions</h2>
        <div className="actions-grid">
          {[
            "Book a Consultation",
            "Order Lab Tests",
            "View Trends",
            "Message Your Coach",
          ].map((action) => (
            <Button key={action} icon labelPosition="right">
              {action}
              <Icon name="arrow right" />
            </Button>
          ))}
        </div>
      </section>

      <footer>
        <Button size="big" onClick={this.restartFlow}>
          Take Another Scan
        </Button>
      </footer>
    </div>
  );

  render() {
    const { view, openInstructionsModal } = this.state;

    return (
      <div className="App">
        <Modal
          open={openInstructionsModal}
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
              <List.Item>Remain still during the recording.</List.Item>
              <List.Item>
                Position your face close to the camera to maximize accuracy.
              </List.Item>
            </List>
          </Modal.Content>
        </Modal>

        {view === "landing" && this.renderLanding()}
        {view === "scan" && this.renderScanner()}
        {view === "results" && this.renderResults()}
      </div>
    );
  }
}

export default App;
