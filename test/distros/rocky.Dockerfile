FROM rockylinux:9
COPY proxy-ca.cr[t] /etc/pki/ca-trust/source/anchors/
RUN update-ca-trust && sed -i 's/^#\?baseurl=http:/baseurl=https:/' /etc/yum.repos.d/*.repo && dnf -y install openssh-server sudo passwd shadow-utils util-linux findutils && dnf clean all
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
