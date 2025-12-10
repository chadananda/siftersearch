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

    // Vortex swirl function
    vec2 vortex(vec2 uv, vec2 center, float strength, float radius) {
      vec2 delta = uv - center;
      float dist = length(delta);
      float angle = strength / (dist + 0.3) * smoothstep(radius, 0.0, dist);
      float s = sin(angle);
      float c = cos(angle);
      return vec2(
        delta.x * c - delta.y * s,
        delta.x * s + delta.y * c
      ) + center;
    }

    // Neural flash effect - always on, concentrated toward center
    float neuralFlash(vec2 uv, float time, vec2 center, float thinking) {
      float flash = 0.0;
      float distFromCenter = length(uv - center);

      // Center concentration multiplier (brighter toward center)
      float centerBoost = 1.0 + exp(-distFromCenter * 3.0) * 2.0;

      // Speed increases toward center
      float speedBoost = 1.0 + (1.0 - smoothstep(0.0, 0.5, distFromCenter)) * 1.5;
      float rate = (1.0 + thinking * 2.0) * speedBoost;

      // Multiple neural impulse sources - biased toward center
      for (int i = 0; i < 8; i++) {
        float fi = float(i);

        // Sources orbit around center, closer sources have tighter orbits
        float orbitRadius = 0.15 + 0.25 * fract(sin(fi * 127.1) * 43758.5);
        float orbitSpeed = 0.5 + fract(sin(fi * 269.5) * 43758.5) * 0.5;
        vec2 source = center + vec2(
          cos(time * orbitSpeed * rate + fi * 0.785) * orbitRadius,
          sin(time * orbitSpeed * rate + fi * 0.785) * orbitRadius
        );

        float dist = length(uv - source);

        // Pulsing rings emanating from source
        float ring = sin(dist * 20.0 - time * rate * 3.0 + fi * 2.0);
        ring = pow(max(ring, 0.0), 3.0);

        // Fade with distance from source
        float fade = exp(-dist * 4.0);

        // Random timing - sharper pulses
        float pulse = sin(time * rate * (1.5 + fi * 0.3)) * 0.5 + 0.5;
        pulse = pow(pulse, 3.0);

        flash += ring * fade * pulse * 0.25;
      }

      // Lightning branches - denser toward center
      float lightning = snoise(uv * 12.0 + time * rate * 1.5);
      lightning = pow(max(lightning, 0.0), 6.0);
      float lightningPulse = sin(time * rate * 2.0) * 0.5 + 0.5;
      flash += lightning * lightningPulse * 0.5 * centerBoost;

      // Sparkles throughout
      float sparkle = snoise(uv * 25.0 + time * rate);
      sparkle = pow(max(sparkle, 0.0), 8.0);
      flash += sparkle * 0.3 * centerBoost;

      // Core glow at center
      float coreGlow = exp(-distFromCenter * 5.0) * 0.4;
      float corePulse = sin(time * rate * 0.8) * 0.3 + 0.7;
      flash += coreGlow * corePulse;

      return flash * (0.6 + thinking * 0.8);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 uvAspect = uv;
      uvAspect.x *= aspect;

      float t = u_time * 0.15;

      // Base vortex speed (always present but subtle)
      float baseVortexSpeed = 0.3;
      // Increased speed when thinking
      float thinkingVortexSpeed = 1.2;
      float vortexSpeed = mix(baseVortexSpeed, thinkingVortexSpeed, u_thinking);

      // Apply vortex swirl - center of screen
      vec2 center = vec2(aspect * 0.5, 0.5);
      float vortexStrength = (0.3 + u_thinking * 0.5) * sin(t * vortexSpeed);
      vec2 swirlUV = vortex(uvAspect, center, vortexStrength, 1.5);

      // Second subtle counter-rotating vortex
      vec2 center2 = vec2(aspect * 0.5, 0.5);
      float vortexStrength2 = (0.15 + u_thinking * 0.3) * cos(t * vortexSpeed * 0.7);
      swirlUV = vortex(swirlUV, center2, -vortexStrength2, 2.0);

      // Multiple layers of flowing noise with swirl
      float n1 = fbm(swirlUV * 2.0 + vec2(t * 0.3, t * 0.2));
      float n2 = fbm(swirlUV * 3.0 - vec2(t * 0.2, t * 0.15) + n1 * 0.5);
      float n3 = fbm(swirlUV * 1.5 + vec2(t * 0.1, -t * 0.25) + n2 * 0.3);

      // Combine layers
      float combined = (n1 + n2 * 0.7 + n3 * 0.5) / 2.2;
      combined = combined * 0.5 + 0.5;

      // Dark theme colors - deep blues and teals
      vec3 dark1 = vec3(0.03, 0.05, 0.12);
      vec3 dark2 = vec3(0.05, 0.12, 0.18);
      vec3 dark3 = vec3(0.08, 0.18, 0.25);
      vec3 dark4 = vec3(0.12, 0.22, 0.32);

      // Light theme colors
      vec3 light1 = vec3(0.97, 0.98, 1.0);
      vec3 light2 = vec3(0.94, 0.96, 0.99);
      vec3 light3 = vec3(0.90, 0.94, 0.98);
      vec3 light4 = vec3(0.85, 0.92, 0.97);

      // Select colors based on theme
      vec3 color1 = mix(light1, dark1, u_darkMode);
      vec3 color2 = mix(light2, dark2, u_darkMode);
      vec3 color3 = mix(light3, dark3, u_darkMode);
      vec3 color4 = mix(light4, dark4, u_darkMode);

      // Gradient mixing
      vec3 color;
      if (combined < 0.33) {
        color = mix(color1, color2, combined * 3.0);
      } else if (combined < 0.66) {
        color = mix(color2, color3, (combined - 0.33) * 3.0);
      } else {
        color = mix(color3, color4, (combined - 0.66) * 3.0);
      }

      // Neural flash effect - always on, brighter when thinking
      float flash = neuralFlash(uv, u_time, center / vec2(aspect, 1.0), u_thinking);

      // Flash color - cyan/electric blue in dark mode, subtle blue in light
      vec3 flashColorDark = vec3(0.2, 0.6, 0.9);
      vec3 flashColorLight = vec3(0.4, 0.6, 0.85);
      vec3 flashColor = mix(flashColorLight, flashColorDark, u_darkMode);

      // Add flash to color (always visible, intensifies when thinking)
      color += flashColor * flash;

      // Subtle overall brightening when thinking
      if (u_thinking > 0.01) {
        color = mix(color, color * 1.15, u_thinking * 0.3);
      }

      // Subtle vignette
      vec2 vignetteCenter = (gl_FragCoord.xy / u_resolution) - 0.5;
      float vignetteStrength = mix(0.2, 0.5, u_darkMode);
      float vignette = 1.0 - dot(vignetteCenter, vignetteCenter) * vignetteStrength;
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
