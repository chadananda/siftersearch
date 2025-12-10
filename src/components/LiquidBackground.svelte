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
  let thinkingIntensityLocation;

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

  const fragmentShaderSource = `#version 300 es
    precision highp float;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_darkMode;
    uniform float u_thinking; // 0.0 = idle, 1.0 = thinking

    out vec4 fragColor;

    // Simplex noise functions
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                         -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                              + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                              dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
      }
      return value;
    }

    // Simple rotation around center - preserves cloud shapes
    vec2 rotate(vec2 uv, vec2 center, float angle) {
      vec2 delta = uv - center;
      float c = cos(angle);
      float s = sin(angle);
      return vec2(delta.x * c - delta.y * s, delta.x * s + delta.y * c) + center;
    }

    // Neural lights - hundreds of tiny flashes, denser toward center
    float neuralLights(vec2 uv, float time, vec2 center) {
      float lights = 0.0;
      float distFromCenter = length(uv - center);

      // Density increases toward center (more lights near vortex core)
      float densityBoost = 1.0 + exp(-distFromCenter * 4.0) * 3.0;

      // Flash rate increases toward center
      float rateBoost = 1.0 + (1.0 - smoothstep(0.0, 0.6, distFromCenter)) * 2.0;

      // Layer 1: Scattered point lights (use noise as a grid of lights)
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float scale = 15.0 + fi * 8.0; // Different scales for variety
        vec2 gridUV = uv * scale;
        vec2 gridID = floor(gridUV);
        vec2 gridLocal = fract(gridUV) - 0.5;

        // Random offset within each grid cell
        float randX = fract(sin(dot(gridID, vec2(127.1, 311.7))) * 43758.5);
        float randY = fract(sin(dot(gridID, vec2(269.5, 183.3))) * 43758.5);
        vec2 offset = vec2(randX - 0.5, randY - 0.5) * 0.8;

        float pointDist = length(gridLocal - offset);

        // Tiny point light
        float point = exp(-pointDist * 25.0);

        // Random flash timing per cell
        float phase = fract(sin(dot(gridID, vec2(419.2, 371.9))) * 43758.5) * 6.28;
        float freq = 1.5 + fract(sin(dot(gridID, vec2(127.7, 231.4))) * 43758.5) * 3.0;
        float flash = sin(time * freq * rateBoost + phase);
        flash = smoothstep(0.4, 1.0, flash); // Sharp on, gradual off

        // Distance from center affects this cell's visibility
        float cellCenter = length((gridID + 0.5) / scale - center);
        float centerMask = 1.0 - smoothstep(0.0, 0.8, cellCenter);
        centerMask = mix(0.3, 1.0, centerMask); // Still some lights at edges

        lights += point * flash * centerMask * 0.4;
      }

      // Layer 2: Sparkle noise for extra tiny lights
      float sparkle = snoise(uv * 30.0 + time * rateBoost * 0.8);
      sparkle = pow(max(sparkle, 0.0), 6.0);
      float sparkle2 = snoise(uv * 50.0 - time * rateBoost * 0.5);
      sparkle2 = pow(max(sparkle2, 0.0), 8.0);

      // More sparkles toward center
      float sparkleCenter = 1.0 - smoothstep(0.0, 0.5, distFromCenter);
      lights += (sparkle * 0.3 + sparkle2 * 0.2) * (0.5 + sparkleCenter * 1.5);

      return lights * densityBoost * 0.15;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;

      // Center point for the swirl
      vec2 center = vec2(0.5 * aspect, 0.5);
      vec2 uvAspect = vec2(uv.x * aspect, uv.y);

      // Slow rotation speed
      float t = u_time * 0.02; // Very slow rotation

      // Distance from center
      float distFromCenter = length(uvAspect - center);

      // Rotate the entire cloud field around center - preserves cloud shapes
      vec2 rotatedUV = rotate(uvAspect, center, t);

      // Add soft organic distortion (subtle, doesn't compound)
      float distort = fbm(rotatedUV * 1.2 + u_time * 0.01) * 0.08;
      vec2 cloudUV = rotatedUV + vec2(distort, distort * 0.6);

      // Multiple cloud layers - slow drifting within the rotating field
      float n1 = fbm(cloudUV * 1.8 + u_time * 0.005);
      float n2 = fbm(cloudUV * 2.8 - u_time * 0.003 + n1 * 0.25);
      float n3 = fbm(cloudUV * 1.5 + vec2(u_time * 0.002, -u_time * 0.004) + n2 * 0.15);

      // Combine cloud layers
      float clouds = (n1 + n2 * 0.5 + n3 * 0.3) / 1.8;
      clouds = clouds * 0.5 + 0.5;

      // Subtle darkening toward center (not a hard void)
      float centerDim = smoothstep(0.0, 0.5, distFromCenter);
      clouds *= mix(0.6, 1.0, centerDim);

      // Dark theme colors - soft deep blues
      vec3 darkBase = vec3(0.02, 0.04, 0.08);
      vec3 darkCloud1 = vec3(0.04, 0.08, 0.15);
      vec3 darkCloud2 = vec3(0.06, 0.12, 0.22);
      vec3 darkCloud3 = vec3(0.09, 0.16, 0.26);

      // Light theme colors
      vec3 lightBase = vec3(0.94, 0.96, 0.98);
      vec3 lightCloud1 = vec3(0.92, 0.94, 0.97);
      vec3 lightCloud2 = vec3(0.88, 0.91, 0.95);
      vec3 lightCloud3 = vec3(0.84, 0.88, 0.93);

      // Select colors based on theme
      vec3 baseColor = mix(lightBase, darkBase, u_darkMode);
      vec3 cloud1 = mix(lightCloud1, darkCloud1, u_darkMode);
      vec3 cloud2 = mix(lightCloud2, darkCloud2, u_darkMode);
      vec3 cloud3 = mix(lightCloud3, darkCloud3, u_darkMode);

      // Smooth gradient through cloud density
      vec3 color;
      if (clouds < 0.4) {
        color = mix(baseColor, cloud1, clouds / 0.4);
      } else if (clouds < 0.6) {
        color = mix(cloud1, cloud2, (clouds - 0.4) / 0.2);
      } else {
        color = mix(cloud2, cloud3, (clouds - 0.6) / 0.4);
      }

      // Add neural lights behind the clouds
      float lights = neuralLights(uvAspect, u_time, center);

      // Light color - soft cyan/blue glow
      vec3 darkLightColor = vec3(0.3, 0.6, 0.9);  // Bright blue for dark mode
      vec3 lightLightColor = vec3(0.1, 0.4, 0.7); // Deeper blue for light mode
      vec3 lightColor = mix(lightLightColor, darkLightColor, u_darkMode);

      // Blend lights additively but subtly
      color += lightColor * lights;

      // Very soft vignette
      vec2 vignetteUV = uv - 0.5;
      float vignetteStrength = mix(0.1, 0.2, u_darkMode);
      float vignette = 1.0 - dot(vignetteUV, vignetteUV) * vignetteStrength;
      color *= vignette;

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
