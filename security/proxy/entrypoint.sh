#!/bin/sh
# Proxy sidecar entrypoint: set up iptables egress rules then start Squid.
set -e

echo "[proxy] Configuring iptables egress rules..."

# Flush any existing rules
iptables -F OUTPUT 2>/dev/null || true

# Allow loopback
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established/related connections
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS (UDP 53) for domain resolution
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT

# Allow outbound HTTPS (TCP 443) only
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

# Drop everything else outbound
iptables -A OUTPUT -j DROP

echo "[proxy] iptables rules applied:"
iptables -L OUTPUT -n -v

# tmpfs mounts under capability-dropped / no-new-privileges often reject chown.
# Prefer best-effort ownership, then make dirs writable for the squid process.
mkdir -p /var/log/squid /var/spool/squid /run
if ! chown -R squid:squid /var/log/squid /var/spool/squid /run 2>/dev/null; then
  echo "[proxy] chown skipped (caps/tmpfs); chmod fallback"
  chmod -R a+rwx /var/log/squid /var/spool/squid /run
fi
touch /var/log/squid/access.log /var/log/squid/cache.log
chown squid:squid /var/log/squid/access.log /var/log/squid/cache.log 2>/dev/null || true
chmod a+rw /var/log/squid/access.log /var/log/squid/cache.log 2>/dev/null || true

# Initialize squid swap directories on empty tmpfs (ignore if already present).
# squid -z can leave a PID file that makes the main process think it is already running.
echo "[proxy] Initializing squid cache (if needed)..."
squid -z -f /etc/squid/squid.conf 2>/dev/null || true
rm -f /run/squid.pid /var/run/squid.pid /var/spool/squid/squid.pid 2>/dev/null || true

echo "[proxy] Starting Squid..."
# Tail access log to stdout for docker logs, run squid in foreground
tail -F /var/log/squid/access.log 2>/dev/null &
exec squid -NYC -f /etc/squid/squid.conf