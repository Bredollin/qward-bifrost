FROM alpine:3.20
# proxy-ca.crt: só para builds atrás de proxy corporativo (opcional, fora do git).
COPY proxy-ca.cr[t] /tmp/
RUN if [ -f /tmp/proxy-ca.crt ]; then cat /tmp/proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt; fi && apk add --no-cache openssh sudo
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
