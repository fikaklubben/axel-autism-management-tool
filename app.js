/**
 * Image Editor Logic
 */

// Image Configuration
const IMAGES = [
    { id: 0, src: 'assets/image0.jpg', name: 'Image 1' },
    { id: 1, src: 'assets/image1.jpg', name: 'Image 2' },
    { id: 2, src: 'assets/image2.jpg', name: 'Image 3' },
    { id: 3, src: 'assets/image3.jpg', name: 'Image 4' }
];

// State
let state = {
    currentImageId: null,
    edits: {} // { [id]: { hue: 0, contrast: 100, exposure: 0 } }
};

// Canvas & Context
let canvas, ctx;
let originalImage = null; // Image object
let offscreenCanvas = null;
let offscreenCtx = null;
let imageBitmap = null; // Use ImageBitmap for performance if supported

// DOM Elements
const galleryGrid = document.getElementById('gallery-grid');
const galleryView = document.getElementById('gallery-view');
const editorView = document.getElementById('editor-view');
const backBtn = document.getElementById('back-btn');
const resetBtn = document.getElementById('reset-btn');
const hueSlider = document.getElementById('hue-slider');
const contrastSlider = document.getElementById('contrast-slider');
const exposureSlider = document.getElementById('exposure-slider');
const hueVal = document.getElementById('hue-val');
const contrastVal = document.getElementById('contrast-val');
const exposureVal = document.getElementById('exposure-val');

// Constants
const WHITE_THRESHOLD = 240; // 0-255. Above this is background.

// Login Elements
const loginView = document.getElementById('login-view');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

/**
 * Initialize the Application
 */
function init() {
    loadState();
    renderGallery();
    setupListeners();
    setupLoginListeners();
    canvas = document.getElementById('editor-canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
}

function setupLoginListeners() {
    loginBtn.onclick = attemptLogin;
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });
    logoutBtn.onclick = logout;
}

function attemptLogin() {
    const password = passwordInput.value;
    if (password === 'ost') {
        // Success
        loginView.classList.remove('active');
        galleryView.classList.add('active');
        loginError.textContent = '';
        passwordInput.value = '';
    } else {
        // Error
        loginError.textContent = 'Incorrect password';
        passwordInput.classList.add('shake');
        setTimeout(() => passwordInput.classList.remove('shake'), 500);
    }
}

function logout() {
    // 1. Save and close editor if open
    if (state.currentImageId !== null) {
        saveState();
        state.currentImageId = null;
        originalImage = null;
    }

    // 2. Hide all app views
    editorView.classList.remove('active');
    galleryView.classList.remove('active');

    // 3. Show Login
    loginView.classList.add('active');
}

function loadState() {
    const saved = localStorage.getItem('imageEditorState');
    if (saved) {
        state.edits = JSON.parse(saved);
    }
    // Initialize missing edits
    IMAGES.forEach(img => {
        if (!state.edits[img.id]) {
            state.edits[img.id] = { hue: 0, contrast: 100, exposure: 0 };
        }
    });
}

function saveState() {
    localStorage.setItem('imageEditorState', JSON.stringify(state.edits));
}

const DISPLAY_WIDTH = 400; // Thumbnail max resolution for performance

function renderGallery() {
    galleryGrid.innerHTML = '';
    IMAGES.forEach(img => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.onclick = (e) => {
            // Prevent triggering if clicked on something else if needed, but here simple click is fine
            openEditor(img.id);
        };

        // Use Canvas for thumbnail to show edits
        const thumbCanvas = document.createElement('canvas');
        // Initial setup - will be drawn async
        item.appendChild(thumbCanvas);
        galleryGrid.appendChild(item);

        // Async load and render
        const thumbImg = new Image();
        thumbImg.src = img.src;
        thumbImg.onload = () => {
            // Scale down for thumbnail
            const aspect = thumbImg.height / thumbImg.width;
            thumbCanvas.width = DISPLAY_WIDTH;
            thumbCanvas.height = DISPLAY_WIDTH * aspect;

            const tCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
            tCtx.drawImage(thumbImg, 0, 0, thumbCanvas.width, thumbCanvas.height);

            // Apply Edits if they exist
            if (state.edits[img.id]) {
                const imageData = tCtx.getImageData(0, 0, thumbCanvas.width, thumbCanvas.height);
                processImageData(imageData, state.edits[img.id]);
                tCtx.putImageData(imageData, 0, 0);
            }
        };
    });
}

function setupListeners() {
    backBtn.onclick = closeEditor;
    resetBtn.onclick = resetEdits;

    // Sliders
    const inputs = [hueSlider, contrastSlider, exposureSlider];
    inputs.forEach(input => {
        input.addEventListener('input', handleInput);
    });
}

/**
 * Navigation
 */
function openEditor(id) {
    state.currentImageId = id;

    // Load Image
    const imgData = IMAGES.find(i => i.id === id);
    originalImage = new Image();
    originalImage.src = imgData.src;
    originalImage.onload = () => {
        initEditorCanvas();
        updateControls();
        galleryView.classList.remove('active');
        editorView.classList.add('active');
        applyEdits();
    };
}

function closeEditor() {
    saveState();
    editorView.classList.remove('active');
    galleryView.classList.add('active');
    state.currentImageId = null;
    originalImage = null; // cleanup
    renderGallery(); // Re-render to show updated thumbnails
}

/**
 * Editor Logic
 */
function initEditorCanvas() {
    // Set canvas dimensions to match image
    // Limit max size for performance if image is huge (e.g. > 4k)
    // For now use native resolution
    canvas.width = originalImage.width;
    canvas.height = originalImage.height;

    // Create offscreen buffer
    if (!offscreenCanvas) offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    // Draw original to offscreen once
    offscreenCtx.drawImage(originalImage, 0, 0);
}

function updateControls() {
    const edits = state.edits[state.currentImageId];
    hueSlider.value = edits.hue;
    contrastSlider.value = edits.contrast;
    exposureSlider.value = edits.exposure;

    hueVal.textContent = edits.hue;
    contrastVal.textContent = edits.contrast + '%';
    exposureVal.textContent = edits.exposure;
}

function handleInput(e) {
    const edits = state.edits[state.currentImageId];
    const val = parseInt(e.target.value);

    if (e.target.id === 'hue-slider') {
        edits.hue = val;
        hueVal.textContent = val;
    } else if (e.target.id === 'contrast-slider') {
        edits.contrast = val;
        contrastVal.textContent = val + '%';
    } else if (e.target.id === 'exposure-slider') {
        edits.exposure = val;
        exposureVal.textContent = val;
    }

    // Use requestAnimationFrame for smooth UI
    requestAnimationFrame(applyEdits);
}

function resetEdits() {
    const edits = state.edits[state.currentImageId];
    edits.hue = 0;
    edits.contrast = 100;
    edits.exposure = 0;
    updateControls();
    applyEdits();
    saveState();
}

/**
 * Image Processing
 */
function applyEdits() {
    if (!originalImage || state.currentImageId === null) return;

    const edits = state.edits[state.currentImageId];

    // Get original pixels
    const imageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Process
    processImageData(imageData, edits);

    // Put data back
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Shared Processing Logic
 */
function processImageData(imageData, edits) {
    const data = imageData.data;
    const len = data.length;

    // Pre-calculate Contrast Factor
    // Formula: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
    // Normalized contrast input: 0 to 200 (100 is neutral)
    // Standard formula input usually -128 to 128 or 0-255? 
    // Let's map 0-200 to generic factor.
    // Actually common formula uses C between -255 and 255.
    // Let's assume input 100 is 0 change. Range 0 -> -128, 200 -> 128 (approx)
    const C = (edits.contrast - 100) * 2.55; // Map to roughly -255 to 255 range
    const contrastFactor = (259 * (C + 255)) / (255 * (259 - C));

    // Exposure Factor
    // Simple additive
    const exposure = edits.exposure;

    // Hue Calculations (cos/sin for rotation)
    // RGB to linear or approximation
    // A simpler approach for Hue is converting RGB to HSL, adjusting H, back to RGB.
    // Optimization: only do expensive math if Hue != 0
    const doHue = edits.hue !== 0;
    const hueRad = edits.hue * (Math.PI / 180);
    const cosA = Math.cos(hueRad);
    const sinA = Math.sin(hueRad);
    // Matrix coefficients for hue rotation
    // R' = R*c1 + G*c2 + B*c3
    // derived from standard matrices
    const sqrt3 = Math.sqrt(3); // 1/sqrt(3) ~ 0.577...
    // Actually, simple rotation around diagonal (1,1,1) in RGB space maintains luminance roughly.
    // Matrix for Hue Rotate:
    // [ L + cos* (1-L) + sin*(-L),   L + cos*(-L) + sin*(-L),  ... ]
    // Let's use simplified approximation or accurate matrix.
    // Accurate matrix coefficients:
    const m00 = cosA + (1.0 - cosA) / 3.0;
    const m01 = 1.0 / 3.0 * (1.0 - cosA) - sqrt3 / 3.0 * sinA;
    const m02 = 1.0 / 3.0 * (1.0 - cosA) + sqrt3 / 3.0 * sinA;
    const m10 = 1.0 / 3.0 * (1.0 - cosA) + sqrt3 / 3.0 * sinA;
    const m11 = cosA + 1.0 / 3.0 * (1.0 - cosA);
    const m12 = 1.0 / 3.0 * (1.0 - cosA) - sqrt3 / 3.0 * sinA;
    const m20 = 1.0 / 3.0 * (1.0 - cosA) - sqrt3 / 3.0 * sinA;
    const m21 = 1.0 / 3.0 * (1.0 - cosA) + sqrt3 / 3.0 * sinA;
    const m22 = cosA + 1.0 / 3.0 * (1.0 - cosA);


    for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // data[i+3] is alpha

        // Masking Check: Is it background?
        // Check if all channels are above threshold
        if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
            // It's background. Do nothing.
            continue;
        }

        // --- Apply Logic to Object ---

        let nr = r;
        let ng = g;
        let nb = b;

        // 1. Hue
        if (doHue) {
            const rx = nr * m00 + ng * m01 + nb * m02;
            const gx = nr * m10 + ng * m11 + nb * m12;
            const bx = nr * m20 + ng * m21 + nb * m22;
            nr = rx; ng = gx; nb = bx;
        }

        // 2. Contrast
        if (contrastFactor !== 1) {
            nr = contrastFactor * (nr - 128) + 128;
            ng = contrastFactor * (ng - 128) + 128;
            nb = contrastFactor * (nb - 128) + 128;
        }

        // 3. Exposure
        if (exposure !== 0) {
            nr += exposure;
            ng += exposure;
            nb += exposure;
        }

        // Clamp 0-255
        data[i] = nr < 0 ? 0 : (nr > 255 ? 255 : nr);
        data[i + 1] = ng < 0 ? 0 : (ng > 255 ? 255 : ng);
        data[i + 2] = nb < 0 ? 0 : (nb > 255 ? 255 : nb);
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
