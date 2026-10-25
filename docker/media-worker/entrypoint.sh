#!/bin/bash
# Pod entrypoint (the pattern of SearchLayerPDF's docker/cloud-worker): authorize the lane's SSH key, keep sshd running, and make sure a pod can
# never bill for long without work. Everything else (selftest, worker, gate) is started by the lane over ssh.
mkdir -p /root/.ssh /workspace/spool && chmod 700 /root/.ssh
[ -n "$PUBLIC_KEY" ] && echo "$PUBLIC_KEY" >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
ssh-keygen -A >/dev/null 2>&1
# the container's env (RUNPOD_POD_ID, the terminate key, HF_HOME ...) is not in an ssh session: keep it where the lane's bootstrap reads it
printenv | grep -E '^(RUNPOD_|RP_|HF_|SIFTER_|PATH=)' | sed 's/^\([^=]*\)=\(.*\)$/export \1="\2"/' > /etc/rp_environment
grep -q rp_environment /root/.bashrc 2>/dev/null || echo 'source /etc/rp_environment' >> /root/.bashrc
# ZOMBIE GUARDS (independent of tower and of the worker): (1) nobody ever came (the lane never connected) -> end in 25 min;
# (2) a hard lifetime of 9 h.  The worker has its own idle / heartbeat switches; the reaper on tower is the third path.
( sleep 1500; [ -e /workspace/.lane-seen ] || /usr/local/bin/self-terminate.sh "no lane connected in 25 min" ) &
( sleep $(( ${SIFTER_MAX_LIFETIME_MIN:-540} * 60 )); /usr/local/bin/self-terminate.sh "lifetime cap" ) &
exec /usr/sbin/sshd -D -e
