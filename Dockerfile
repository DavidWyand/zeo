FROM debian:latest

RUN apt-get update && apt-get upgrade && apt-get install -y build-essential cmake python curl git && apt-get clean
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash
RUN bash -c 'NVM_DIR="/root/.nvm"; . "$NVM_DIR/nvm.sh"; nvm install 7.4.0;'
ENV PATH $PATH:/root/.nvm/versions/node/v7.4.0/bin/
RUN node -v
ADD package.json index.js public core plugins README.md docs scripts /root/zeo/
WORKDIR /root/zeo/
RUN npm install

ENTRYPOINT ["npm", "start"]