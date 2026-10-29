FROM debian:12
COPY proxy-ca.cr[t] /tmp/
RUN sed -i 's#http://deb.debian.org#https://deb.debian.org#g' /etc/apt/sources.list.d/debian.sources && \
    if [ -f /tmp/proxy-ca.crt ]; then echo 'Acquire::https::CaInfo "/tmp/proxy-ca.crt";' > /etc/apt/apt.conf.d/99proxy-ca; fi && \
    apt-get update && apt-get install -y --no-install-recommends openssh-server sudo && rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99proxy-ca
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
