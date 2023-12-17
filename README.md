# The model for remote photoplethysmography

In order to gain a comprehensive understanding of the techniques used for extracting pulses in remote photoplethysmography (rPPG), it's essential to begin with a foundational rPPG model. This model incorporates key optical and physiological aspects of skin reflectance. By employing this model, we can delve deeply into the specific challenges encountered in this field and explore the various ways these challenges are tackled in different rPPG approaches. Imagine a scenario where human skin, imbued with pulsating blood, is illuminated by a light source, and a distant color camera captures this scene, as depicted in Figure 1. It's assumed here that the light source emits light of a consistent spectral quality, though its intensity may fluctuate. The intensity captured by the camera is influenced by the distance between the light source, the skin, and the camera's sensor. The skin's appearance, as recorded by the camera, displays a particular color that undergoes temporal variations. These variations are a result of both the movement-induced changes in intensity and specular reflections, as well as the subtle color shifts caused by the pulse. The degree of these temporal changes is directly linked to the level of luminance intensity.

Utilizing the dichromatic reflection model, we can articulate the reflection of each skin pixel in a recorded image sequence as a function that varies over time within the RGB color space. This function is expressed as:

$$
C_k(t) = I(t) \cdot (v_s(t) + v_d(t)) + v_n(t),
$$

where \(C_k(t)\) represents the RGB values of the \(k^{th}\) skin pixel at time \(t\); \(I(t)\) is the luminance intensity, absorbing changes due to the light source and the varying distances between the light source, skin, and camera. In the dichromatic model, \(I(t)\) is influenced by two types of reflections: specular (\(v_s(t)\)) and diffuse (\(v_d(t)\)). These reflections change over time due to body movements and the pulsating nature of blood flow. The term \(v_n(t)\) accounts for the camera sensor's quantization noise.

Specular reflection (\(v_s(t)\)) is akin to a mirror-like reflection from the skin's surface and does not carry pulsatile information. Its spectral composition mirrors that of the light source and changes with body movements, affecting the geometry of the light source, skin, and camera. Specular reflection is defined as:

$$
v_s(t) = u_s \cdot (s_0 + s(t)),
$$

where \(u_s\) is the unit color vector of the light spectrum, \(s_0\) is the constant component, and \(s(t)\) represents the motion-induced variable component of specular reflections.

Diffuse reflection (\(v_d(t)\)), on the other hand, results from light absorption and scattering within the skin tissues. Influenced by the concentration of hemoglobin and melanin, it has a distinct chromaticity and varies with blood volume changes, thus being time-dependent. It is expressed as:

$$
v_d(t) = u_d \cdot d_0 + u_p \cdot p(t),
$$

where \(u_d\) is the unit color vector for skin tissue, \(d_0\) represents the constant reflection strength, \(u_p\) the relative pulsatile strengths in the RGB channels, and \(p(t)\) the pulse signal. Integrating these reflections into the initial equation, we get:

$$
C_k(t) = I(t) \cdot (u_s \cdot (s_0 + s(t)) + u_d \cdot d_0 + u_p \cdot p(t)) + v_n(t).
$$

The constant components of specular and diffuse reflections can be merged into a single term representing the static skin reflection:

$$
u_c \cdot c_0 = u_s \cdot s_0 + u_d \cdot d_0,
$$

where \(u_c\) is the unit color vector for skin reflection and \(c_0\) the reflection strength. Thus, the equation is reformulated as:

$$
C_k(t) = I_0 \cdot (1 + i(t)) \cdot (u_c \cdot c_0 + u_s \cdot s(t) + u_p \cdot p(t)) + v_n(t),
$$

Here, \(I(t)\) is decomposed into a stationary part \(I_0\) and a time-varying part \(I_0 \cdot i(t)\), where \(i(t), s(t)\), and \(p(t)\) are signals with zero mean. It's important to note that specular reflection can be the predominant component, potentially overshadowing other elements. We assume the existence of methods (like a skin classifier) to mitigate areas where specular reflection is dominant.

![Reflectance Model](https://rppg.rateria.me/media/img/model.png)
*Figure 1. The Reflectance Model.*

# Blind Source Separation

Independent Component Analysis (ICA) is a comparatively novel method for extracting independent signals from a collection of observations. These observations are typically linear combinations of fundamental source signals [3]. In this application, the focus is on the Blood Volume Pulse (BVP), which circulates throughout the human body. The cardiac cycle influences the volume of blood vessels in the face, altering the path of incident light. This alteration affects the reflected light, revealing the timing of cardiovascular activities. By capturing a video of the face using a standard webcam, the red, green, and blue (RGB) sensors detect a blend of the reflected plethysmographic signal and other light fluctuations caused by various artifacts. Considering the different absorptivity rates of hemoglobin across the visible and near-infrared spectrum [4], each RGB sensor captures a unique combination of the original signals, with varying weights. These captured signals from the RGB sensors are represented as \(y1(t), y2(t),\) and \(y3(t),\) indicating the signal amplitudes at any given time \(t\). The model hypothesizes the existence of three primary source signals: \(x1(t), x2(t),\) and \(x3(t)\). According to the ICA framework, the observed signals are linear combinations of these source signals, expressed as:

$$
y(t) = Ax(t)
$$

Here, the vectors \(y(t) = [y1(t), y2(t), y3(t)]^T\) and \(x(t) = [x1(t), x2(t), x3(t)]^T\), while the \(3x3\) matrix \(A\) contains the coefficients of the mixtures. The objective of ICA is to determine a demixing matrix \(W\), which approximates the inverse of \(A\). The output of this process,

$$
\hat{x}(t) = Wy(t)
$$

provides an estimation of the vector \(x(t)\), which encompasses the underlying source signals.

![Reflectance Model](https://rppg.rateria.me/media/img/outline.png)
*Figure 2. Face detection is performed on the video frames, resulting in the red bounding box on the face. Next, regions of interest (ROIs) such as the cheeks marked by the black boxes are selected within the face box. The rPPG signal is extracted from the pixels within the ROIs. Lastly, post-processing techniques, such as frequency analysis (e.g., Fourier transform) and peak detection, are applied on the extracted signal to estimate HR.*

To perform remote heart rate (HR) measurement, we adhere to a process similar to what is depicted in Figure 2. The procedure begins with a digital camera recording a video of the individual. Subsequently, a facial recognition algorithm, like the [68 face landmark net](https://github.com/justadudewhohacks/face-api.js), is employed to determine the facial bounding box coordinates. Following this, specific regions of interest (ROIs) on the face, such as the cheeks, are chosen for their strong signal presence. The pixel data from these ROIs are then utilized for remote photoplethysmography (rPPG) signal extraction. The final step in estimating the HR involves additional post-processing, which generally includes frequency analysis and the identification of signal peaks.

# Plane Orthogonal To Skin (POS)

The plane-orthogonal-to-skin (POS) method uses the plane orthogonal to the skin tone in the RGB signal to extract the rPPG signal. The method is described in detail in [1].

![Plane-Orthogonal-To-Skin Algorithm](https://rppg.rateria.me/media/img/pos-algorithm.png)
*Figure 3. Plane-Orthogonal-To-Skin Algorithm.*

# References

1. Wang, W., den Brinker, A. C., Stuijk, S., & de Haan, G. (2017). Algorithmic principles of remote-PPG. IEEE Transactions on Biomedical Engineering, 64(7), 1479-1491. Article 7565547. [https://doi.org/10.1109/TBME.2016.2609282](https://doi.org/10.1109/TBME.2016.2609282)

2. Cheng, Chun-Hong & Wong, Kwan-Long & Chin, Jing-Wei & Chan, Tsz Tai & So, Richard. (2021). Deep Learning Methods for Remote Heart Rate Measurement: A Review and Future Research Agenda. Sensors. 21. 6296. [10.3390/s21186296](https://doi.org/10.3390/s21186296).

3. P. Comon, “Independent component analysis, a new concept?” Signal Process., vol. 36, pp. 287–314, 1994.

4. W. G. Zijlstra, A. Buursma, and W. P. Meeuwsen-van der Roest, “Absorption spectra of human fetal and adult oxyhemoglobin, deoxyhemoglobin, carboxyhemoglobin, and methemoglobin,” Clin. Chem., vol. 37, pp. 1633–1638, Sep. 1991.
