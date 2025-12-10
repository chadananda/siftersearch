<script>
  import { onMount, onDestroy } from 'svelte';

  let canvas;
  let gl;
  let animationId;
  let startTime;
  let program;
  let isVisible = true;
  let isDarkMode = $state(true);
  let themeLocation;

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
    uniform float u_darkMode; // 1.0 = dark, 0.0 = light

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

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      uv.x *= aspect;

      float t = u_time * 0.15;

      // Multiple layers of flowing noise
      float n1 = fbm(uv * 2.0 + vec2(t * 0.3, t * 0.2));
      float n2 = fbm(uv * 3.0 - vec2(t * 0.2, t * 0.15) + n1 * 0.5);
      float n3 = fbm(uv * 1.5 + vec2(t * 0.1, -t * 0.25) + n2 * 0.3);

      // Combine layers
      float combined = (n1 + n2 * 0.7 + n3 * 0.5) / 2.2;
      combined = combined * 0.5 + 0.5; // Normalize to 0-1

      // Dark theme colors - deep blues and teals
      vec3 dark1 = vec3(0.03, 0.05, 0.12);  // Deep navy
      vec3 dark2 = vec3(0.05, 0.12, 0.18);  // Dark teal
      vec3 dark3 = vec3(0.08, 0.18, 0.25);  // Lighter teal
      vec3 dark4 = vec3(0.12, 0.22, 0.32);  // Accent

      // Light theme colors - soft whites and light blues
      vec3 light1 = vec3(0.97, 0.98, 1.0);   // Near white
      vec3 light2 = vec3(0.94, 0.96, 0.99);  // Soft blue-white
      vec3 light3 = vec3(0.90, 0.94, 0.98);  // Light blue tint
      vec3 light4 = vec3(0.85, 0.92, 0.97);  // Accent blue

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

      // Subtle vignette (less intense in light mode)
      vec2 center = (gl_FragCoord.xy / u_resolution) - 0.5;
      float vignetteStrength = mix(0.2, 0.5, u_darkMode);
      float vignette = 1.0 - dot(center, center) * vignetteStrength;
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

    // Get theme uniform location
    themeLocation = gl.getUniformLocation(program, 'u_darkMode');

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
    // System preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function render(timestamp) {
    if (!gl || !isVisible) {
      animationId = requestAnimationFrame(render);
      return;
    }

    // Check theme on each frame for smooth transitions
    isDarkMode = checkTheme();

    const time = (timestamp - startTime) / 1000;

    gl.useProgram(program);

    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

    gl.uniform1f(timeLocation, time);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(themeLocation, isDarkMode ? 1.0 : 0.0);

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
