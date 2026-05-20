// Optimized animated film grain noise overlay
(function () {
  const canvas = document.getElementById('noise-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const width = 128;
  const height = 128;
  const frames = [];
  const totalFrames = 6;
  
  // Pre-generate noise frames once in memory
  for (let f = 0; f < totalFrames; f++) {
    const fCanvas = document.createElement('canvas');
    fCanvas.width = width;
    fCanvas.height = height;
    const fCtx = fCanvas.getContext('2d');
    const img = fCtx.createImageData(width, height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      data[i] = data[i+1] = data[i+2] = v;
      data[i+3] = 16; // subtle alpha for film grain texture
    }
    fCtx.putImageData(img, 0, 0);
    frames.push(fCanvas);
  }

  let currentFrame = 0;
  let lastTime = 0;
  const fps = 24; // Film grain at 24fps looks organic and uses minimal resources
  const interval = 1000 / fps;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function loop(time) {
    requestAnimationFrame(loop);
    
    const delta = time - lastTime;
    if (delta < interval) return;
    lastTime = time - (delta % interval);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw pre-generated noise pattern repeated across screen
    const pattern = ctx.createPattern(frames[currentFrame], 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    currentFrame = (currentFrame + 1) % totalFrames;
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();
