// visualizer.js - Audio Visualization (VU Meter)

/**
 * @param {MediaStream} stream - steam to be analyzed
 * @param {string} id - user identifier (me or other user)
 */
// Analyzes an audio stream and updates the UI bar for the user
function attachVisualizer(stream, id) {
    // Create new audio context
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();

    // Set FFT size
    an.fftSize = 64;
    src.connect(an);

    const data = new Uint8Array(an.frequencyBinCount);
    const bar = document.getElementById(`meter-fill-${id}`);

    // Continuous drawing loop
    function draw() {
        // Stop if user card is removed
        if (!document.getElementById(`user-${id}`)) {
            ac.close(); // Release resources
            return;
        }

        an.getByteFrequencyData(data);

        // Calculate total frequency
        let sum = 0;
        for (let i of data) sum += i;

        // Convert to percentage width
        if (bar) {
            bar.style.width = Math.min(100, (sum / data.length) * 2.5) + "%";
        }

        // Schedule next frame
        requestAnimationFrame(draw);
    }

    draw();
}

module.exports = {
    attachVisualizer
};