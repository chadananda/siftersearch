# Tower service trim 2026-10-28 (Chad: "remove unneeded services")
sudo -n worked; done live, no reboot, no pm2 restart. Verified after: pm2 35/18 online, zpool healthy, tailscale up, UPS OL, gateway /healthz 200, qdrant-hot + nut-monitor active.
Log: tower:~/tower-trim.log. Script: tower:~/tower-trim.sh (idempotent).
Reversible: `sudo systemctl unmask X && sudo systemctl enable --now X`; `sudo systemctl set-default graphical.target` for the desktop.

## Disabled + masked (RSS at audit)
gdm + gnome-shell + Xorg + ibus (~230 MB; idle greeter, nobody local), gnome-remote-desktop 9, cups/cups-browsed/snap cups ~30, avahi 5, ModemManager 8, colord 10, bluetooth, apport, kerneloops, switcheroo-control 4, ollama 18 (no models, 0 requests in 3 d), openvpn + sssd (no configs/inactive). Default target now multi-user.
Snaps removed (disk): thunderbird, firefox, gedit, snap-store, firmware-updater, snapd-desktop-integration, cups, gnome-42/46, gtk-common-themes, mesa-2404.
Est. freed RAM ~350 MB resident (+ less CPU wakeups/log writes); the box was never short of RAM, the win is fewer daemons and disk writes.
Not-done residue: `logrotate` failed (pre-existing, check), snap.cups.cups-browsed unit stuck failed (cosmetic).

## Needs Chad's call (left running)
- minio 238 MB: serves /tank/backups on :9000/:9001; no recent clients seen, but it is the backup store. If nothing writes backups through S3: `sudo systemctl disable --now minio`.
- samba smbd/nmbd ~20 MB: shares documents/media/backups/fast; no sessions at audit. `sudo systemctl disable --now smbd nmbd`.
- NFS server: exports /tank read-only to tailnet (boss/aorus may mount). `sudo systemctl disable --now nfs-server nfs-mountd nfs-idmapd rpcbind`.
- docker + containerd ~55 MB: zero containers; media worker runs elsewhere. `sudo systemctl disable --now docker containerd docker.socket`.
- syncthing (user) : running 2 d; unknown use. `systemctl --user disable --now syncthing`.
- snapd 40 MB + canonical-livepatch: livepatch gives no-reboot kernel fixes; keep unless you reboot regularly. Remaining snaps chromium, code, powershell, snapcraft (reader-first-paint script mentions chromium).
- unattended-upgrades 12 MB: can restart services; mask if you want upgrades manual.
- fwupd 33 MB, udisks2, upower, power-profiles-daemon, wpa_supplicant, nvidia-persistenced (keep if GPU used), smartmontools (keep).
