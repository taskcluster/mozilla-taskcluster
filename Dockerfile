FROM node:0.10.35
MAINTAINER James Lal [:lightsofapollo]
COPY . /app
WORKDIR /app
RUN npm install
