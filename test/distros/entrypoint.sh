#!/bin/sh
# Servidor SSH descartável para teste. Senhas vêm do ambiente (docker run -e), nunca de arquivo.
set -e
id qward >/dev/null 2>&1 || { command -v useradd >/dev/null && useradd -m -s /bin/sh qward || adduser -D -s /bin/sh qward; }
echo "qward:$TEST_PASS" | chpasswd
echo "root:$TEST_ROOTPASS" | chpasswd
mkdir -p /etc/sudoers.d /srv /run/sshd
echo 'qward ALL=(ALL) ALL' > /etc/sudoers.d/qward && chmod 440 /etc/sudoers.d/qward
ssh-keygen -A >/dev/null
exec /usr/sbin/sshd -D -e -o PasswordAuthentication=yes -o PermitRootLogin=no
