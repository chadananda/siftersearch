<script>
  import { onMount, onDestroy } from 'svelte';
  import { getThinkingState } from '../lib/stores/thinking.svelte.js';

  let canvas;
  let gl;
  let animationId;
  let startTime;
  let program;
  let isVisible = true;
  let isDarkMode = $state(true);
  let themeLocation;
  let thinkingLocation;

  // Get thinking state from shared store
  const thinkingState = getThinkingState();

  // Smooth transition for thinking state
  let targetThinking = $state(0);
  let currentThinking = 0;

  // Shader sources
  const vertexShaderSource = `#version 300 es
    in vec4 a_position;
    void main() {
      gl_Position = a_position;
    }
  `;

  // Simplified Neural Network - flowing particles toward center
  const fragmentShaderSource = `#version 300 es
    precision highp float;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_darkMode;
    uniform float u_thinking;

    out vec4 fragColor;

    // Hash functions
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    vec2 hash2(vec2 p) {
      return vec2(hash(p), hash(p + vec2(37.0, 17.0)));
    }

    // FBM noise for flowing effect
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;

      // Center the coordinates
      vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
      float distFromCenter = length(p);

      float time = u_time * 0.3;

      // Background colors
      vec3 darkBg = vec3(0.02, 0.03, 0.08);
      vec3 lightBg = vec3(0.92, 0.95, 0.98);
      vec3 bgColor = mix(lightBg, darkBg, u_darkMode);

      // Node/particle colors
      vec3 darkNode = vec3(0.3, 0.6, 1.0);
      vec3 lightNode = vec3(0.1, 0.4, 0.8);
      vec3 nodeColor = mix(lightNode, darkNode, u_darkMode);

      // Start with background
      vec3 color = bgColor;

      // Create flowing particle field using noise
      // Particles flow inward toward center
      float flow = 0.0;

      // Multiple scales of particles
      for (int i = 0; i < 3; i++) {
        float scale = 8.0 + float(i) * 6.0;
        float speed = 0.5 - float(i) * 0.1;

        // Flow direction toward center
        vec2 flowDir = -normalize(p + 0.001) * time * speed;
        vec2 flowP = p * scale + flowDir;

        // Grid-based particles
        vec2 gridId = floor(flowP);
        vec2 gridUv = fract(flowP) - 0.5;

        // Random offset per cell
        vec2 offset = hash2(gridId) - 0.5;
        offset *= 0.6;

        // Particle position with wobble
        float wobble = sin(time * 2.0 + hash(gridId) * 6.28) * 0.1;
        vec2 particlePos = gridUv - offset + vec2(wobble, wobble * 0.7);

        float dist = length(particlePos);

        // Particle glow
        float glow = 0.015 / (dist * dist + 0.01);

        // Pulsing
        float pulse = 0.7 + 0.3 * sin(time * 3.0 + hash(gridId) * 6.28);

        // Brighter toward center
        float centerBoost = 1.0 + (1.0 - smoothstep(0.0, 0.5, distFromCenter)) * 2.0;

        // Layer falloff
        float layerBright = 1.0 - float(i) * 0.3;

        flow += glow * pulse * centerBoost * layerBright * 0.15;
      }

      // Add flow noise for organic feel
      float flowNoise = fbm(p * 3.0 + time * 0.2);
      flowNoise = pow(flowNoise, 2.0) * 0.3;

      // Central glow
      float coreGlow = 0.08 / (distFromCenter * distFromCenter + 0.05);
      coreGlow *= 0.3;

      // Combine
      color += nodeColor * flow;
      color += nodeColor * flowNoise * (1.0 - smoothstep(0.0, 0.6, distFromCenter));
      color += nodeColor * coreGlow;

      // Soft vignette
      float vignette = 1.0 - distFromCenter * 0.5;
      color *= vignette;

      color = clamp(color, 0.0, 1.0);

      fragColor = vec4(color, 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function initWebGL() {
    gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power'
    });

    if (!gl) {
      console.warn('WebGL2 not supported, falling back to CSS');
      return false;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return false;

    program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return false;

    // Create fullscreen quad
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    themeLocation = gl.getUniformLocation(program, 'u_darkMode');
    thinkingLocation = gl.getUniformLocation(program, 'u_thinking');

    return true;
  }

  function resize() {
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      if (gl) {
        gl.viewport(0, 0, width, height);
      }
    }
  }

  function checkTheme() {
    if (typeof document === 'undefined') return true;
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'light') return false;
    if (theme === 'dark') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function render(timestamp) {
    if (!gl || !isVisible) {
      animationId = requestAnimationFrame(render);
      return;
    }

    // Check theme on each frame
    isDarkMode = checkTheme();

    // Update target thinking state from shared store
    targetThinking = thinkingState.isThinking ? 1.0 : 0.0;

    // Smooth transition for thinking state
    const smoothingFactor = 0.08; // Adjust for faster/slower transitions
    currentThinking += (targetThinking - currentThinking) * smoothingFactor;

    const time = (timestamp - startTime) / 1000;

    gl.useProgram(program);

    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

    gl.uniform1f(timeLocation, time);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(themeLocation, isDarkMode ? 1.0 : 0.0);
    gl.uniform1f(thinkingLocation, currentThinking);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationId = requestAnimationFrame(render);
  }

  function handleVisibilityChange() {
    isVisible = !document.hidden;
  }

  onMount(() => {
    startTime = performance.now();
    isDarkMode = checkTheme();

    if (initWebGL()) {
      resize();
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      animationId = requestAnimationFrame(render);
    }
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<canvas
  bind:this={canvas}
  class="background-canvas"
  aria-hidden="true"
></canvas>

<style>
  .background-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -10;
    background: light-dark(
      linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%),
      linear-gradient(135deg, #0a0f1a 0%, #0d1520 50%, #0f1a28 100%)
    );
  }
</style>
