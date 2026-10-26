"""Low-cost worker GPU telemetry; exits with its container, changes no hardware settings."""
import json, subprocess, sys, time


def read_gpu():
    fields = 'temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw'
    r = subprocess.run(['nvidia-smi', '--query-gpu=' + fields, '--format=csv,noheader,nounits'],
                       capture_output=True, text=True, check=True, timeout=5)
    temp, util, used, total, watts = map(float, r.stdout.splitlines()[0].split(','))
    return dict(temp_c=temp, gpu_util=util, vram_used_mb=used, vram_total_mb=total, power_w=watts)


def monitor(path, interval=10):
    with open(path, 'a', buffering=1) as out:
        while True:
            try:
                row = dict(at=time.time(), **read_gpu())
                row['thermal_warning'] = row['temp_c'] >= 85
            except Exception as e:
                row = dict(at=time.time(), telemetry_error=str(e))
            out.write(json.dumps(row) + '\n')
            time.sleep(interval)


if __name__ == '__main__':
    monitor(sys.argv[1])
