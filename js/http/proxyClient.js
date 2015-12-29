/**
 * Created by Hunter on 5/6/2015.
 */
"use strict";

var http=require('http');
var https=require('https');

var fs = require('fs');

var httpHandler = require('./proxyClientHttp').httpHandler;
var httpsHandler = require('./proxyClientHttps').httpsHandler;

var proxyServerUrl = null;
var proxyServerPort = null;

var getReqNum = require('../numberUtil').getReqNumFunc();

/**
 * Entry point for the client server
 * @param port
 * @param remoteUrl
 * @param remotePort
 */
function start(port, remoteUrl, remotePort) {
    proxyServerUrl = remoteUrl;
    proxyServerPort = remotePort;

    // Create an http server to capture browser input
    var server = http.createServer(httpHandler.bind(null, getReqNum, proxyServerUrl, proxyServerPort)).listen(port);

    // On connection to handle HTTPs
    server.on('connect', httpsHandler.bind(null, getReqNum, proxyServerUrl, proxyServerPort)); // HTTPS connect listener

    console.info("Http&Https proxy listening on port: " + port);
}

exports.start = start;