# Audiogram short renderer (boss, through the gate's `short` verb). Input dir: spec.json, audio.m4a, captions.ass and
# optionally portrait.jpg (face-centred by the image worker). Output: out.mp4 (H.264 + AAC, faststart). Fixed recipes per
# template (api/lib/media/shorts.js renderSpec) — never arbitrary arguments:
#   ground  warm (dark + amber radial glow) · sepia (portrait, sepia, grain, flicker) · deep (blurred dark portrait)
#           · gradient (calm two-colour gradient)
#   record  the portrait as a circular label on a black disc, turning slowly (On Air)
#   kenburns  a slow zoom on the portrait (Portrait Cinema)
# then an amber waveform of the clip and the ASS layer; the audio is padded with silence under the end card.
# COMPRESSION is a design rule (Chad 10-22): large areas stay static between frames (backgrounds, portraits, textures are
# computed once and looped; the Ken Burns zoom is slow); motion lives in small regions (the current word, the waveform
# strip, the needle, the record notch); gradients carry a light static dither against banding. Encoding follows the
# Shorts/Reels specs: H.264 high, CRF 26 capped at 1.2 Mbit/s, GOP 2 s, 30 fps, AAC 128k mono, faststart (≤ 10 MB/min).
import json, os, subprocess, sys

d = sys.argv[1]
s = json.load(open(os.path.join(d, 'spec.json')))
W, H, fps, total = int(s['W']), int(s['H']), int(s['fps']), float(s['total'])
threads = str(max(1, min(16, int(os.environ.get('SHORT_THREADS', '8')))))
P = os.path.join(d, 'portrait.jpg')
has_p = bool(s.get('portrait')) and os.path.exists(P)
frames = int(total * fps) + fps
# a static layer is computed ONCE (one frame) and looped: per-pixel geq on every 1080×1920 frame cost 25 s per short
ONCE = f'loop=loop=-1:size=1:start=0,setpts=N/{fps}/TB,trim=duration={total:.2f}'

args = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', threads, '-i', os.path.join(d, 'audio.m4a')]
if has_p:
    args += ['-loop', '1', '-framerate', str(fps), '-t', f'{total:.2f}', '-i', P]
g, last = [], None
ground = s.get('ground', 'deep')

if ground == 'gradient' or not has_p and ground in ('sepia', 'deep'):
    g.append(f'gradients=s={W}x{H}:c0=0x10202a:c1=0x2a1f14:x0=0:y0=0:x1={W}:y1={H}:speed=0:r={fps}:d={1/fps:.4f},format=yuv420p,{ONCE}[g0]')
    last = 'g0'
elif ground == 'warm':
    w4, h4 = W // 4, H // 4
    e = f'exp(-((X-{w4/2})^2+(Y-{h4*0.62})^2)/{180000/16})'
    g.append(f"color=c=0x14100c:s={w4}x{h4}:r={fps}:d={1/fps:.4f},format=rgb24,geq=r='20+90*{e}':g='16+55*{e}':b='12+12*{e}',"
             f'scale={W}:{H}:flags=bicubic,noise=alls=3:allf=u,format=yuv420p,{ONCE}[g0]')
    last = 'g0'
elif ground == 'sepia':
    # sepia + grain + vignette computed ONCE and looped (a fresh grain every frame made a 30 s short 203 MB); only a slow,
    # gentle flicker moves, which compresses well
    g.append(f'[1:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,trim=end_frame=1,'
             f'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=brightness=-0.18:contrast=1.1,'
             f"noise=alls=14:allf=u,vignette=PI/4,{ONCE},eq=brightness='-0.015*sin(2*PI*t*0.6)':eval=frame[g0]")
    last = 'g0'
else:   # deep: the portrait blurred and darkened
    if s.get('kenburns') and has_p:
        g.append(f"[1:v]scale={W*2}:-2,zoompan=z='min(1.0+0.0007*on,1.25)':x='iw/2-(iw/zoom/2)':y='ih/3-(ih/zoom/3)':d={frames}:s={W}x{H}:fps={fps},"
                 f'eq=brightness=-0.22,vignette=PI/3,setsar=1[g0]')
    else:
        g.append(f'[1:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:2,eq=brightness=-0.34:saturation=0.6,setsar=1[g0]')
    last = 'g0'

rec = s.get('record')
if rec and has_p:
    n, lab = int(rec['size']), int(rec['size'] * 0.46)
    g.append(f"color=c=black:s={n}x{n}:r={fps}:d={1/fps:.4f},format=rgba,geq=r='18+10*mod(floor(hypot(X-{n/2},Y-{n/2})/6),2)':g='18+10*mod(floor(hypot(X-{n/2},Y-{n/2})/6),2)':b='20+10*mod(floor(hypot(X-{n/2},Y-{n/2})/6),2)':a='if(lt(hypot(X-{n/2},Y-{n/2}),{n/2-2}),255,0)',{ONCE}[disc]")
    g.append(f"[1:v]scale={lab}:{lab}:force_original_aspect_ratio=increase,crop={lab}:{lab},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-{lab/2},Y-{lab/2}),{lab/2-1}),255,0)',{ONCE}[lab]")
    g.append(f"color=c=0xF2B23A:s=10x{int(n*0.16)}:r={fps}:d={total:.2f},format=rgba[notch]")
    g.append(f"[disc][notch]overlay={n//2-5}:{int(n*0.06)},rotate=a='t*0.9':c=none:ow={n}:oh={n}[spin]")
    g.append(f"[spin][lab]overlay={(n-lab)//2}:{(n-lab)//2}[rec]")
    g.append(f'[{last}][rec]overlay={int(rec["x"])}:{int(rec["y"])}[g1]')
    last = 'g1'

wv = s['wave']
# the waveform as a white mask over a solid amber layer: the same amber on every ground (showwaves' own colours came out
# green after the overlay's colour conversion)
g.append(f'[0:a]aformat=channel_layouts=mono,showwaves=s={int(wv["w"])}x{int(wv["h"])}:mode=cline:draw=full:rate={fps}:colors=white:scale=sqrt,format=gray[wm]')
g.append(f'color=c=0xF2B23A:s={int(wv["w"])}x{int(wv["h"])}:r={fps}:d={total:.2f},format=rgba[amb]')
g.append('[amb][wm]alphamerge[wv]')
g.append(f'[{last}][wv]overlay={int(wv["x"])}:{int(wv["y"])}:eof_action=pass[g2]')
ass = os.path.join(d, 'captions.ass').replace('\\', '/').replace(':', r'\:')
Q = os.path.join(d, 'qr.png')
if s.get('qr') and os.path.exists(Q):
    q = s['qr']
    args += ['-loop', '1', '-framerate', str(fps), '-t', f'{total:.2f}', '-i', Q]
    qi = 2 if has_p else 1
    g.append(f"[g2]ass='{ass}'[g3]")
    g.append(f"[{qi}:v]scale={int(q['size'])}:{int(q['size'])}:flags=neighbor[qr]")
    g.append(f"[g3][qr]overlay={int(q['x'])}:{int(q['y'])}:enable='gte(t,{float(s['clip']):.2f})',format=yuv420p[v]")
else:
    g.append(f"[g2]ass='{ass}',format=yuv420p[v]")
g.append(f'[0:a]apad=whole_dur={total:.2f}[a]')
args += ['-filter_complex', ';'.join(g), '-map', '[v]', '-map', '[a]', '-t', f'{total:.2f}', '-r', str(fps),
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-maxrate', '1200k', '-bufsize', '2400k', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', str(fps * 2), '-keyint_min', str(fps),
         # ≤ 10 MB per 60 s for every template (1.2 Mbit/s video + 128 kbit/s audio ≈ 10 MB/min worst case)
         '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-ar', '48000', '-movflags', '+faststart', os.path.join(d, 'out.mp4')]
r = subprocess.run(['nice', '-n', '10'] + args, capture_output=True, text=True)
if r.returncode:
    sys.stderr.write(r.stderr[-3000:])
    sys.exit(1)
