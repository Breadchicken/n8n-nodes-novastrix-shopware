# Toolchain for working on the package: npm install, build, lint, tests, tsc --watch.
# Runs as the host user (UID/GID build args) so files in the bind-mounted repo keep their owner.
# The full Debian image is needed: isolated-vm (via n8n-workflow) compiles with node-gyp.
FROM node:26-bookworm

ARG UID=1000
ARG GID=1000
RUN groupmod -o -g "$GID" node && usermod -o -u "$UID" -g "$GID" node

USER node
# Not directly under /: the n8n lint plugin never finds a package.json there.
WORKDIR /workspace/n8n-nodes-novastrix-shopware
