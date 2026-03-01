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

# Ensure log directory is writable by squid user
chown -R squid:squid /var/log/squid /var/spool/squid /run
touch /var/log/squid/access.log /var/log/squid/cache.log
chown squid:squid /var/log/squid/access.log /var/log/squid/cache.log

echo "[proxy] Starting Squid..."
# Tail access log to stdout for docker logs, run squid in foreground
tail -F /var/log/squid/access.log 2>/dev/null &
exec squid -NYC -f /etc/squid/squid.conf
