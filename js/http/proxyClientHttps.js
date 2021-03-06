/**
 * Created by Hunter on 12/21/2015.
 */

"use strict";

var net = require('net');

var setupTcpTimeout = require('../socketUtil').setupTcpTimeout;
var getHostAndPort = require('../urlUtil').getHostAndPort;

var HEADER_SEPARATOR = "}";

var proxyResponseMap = {};
var browserRequestMap = {};
var reqUrl = {};
var proxyErrors = {};
var browserErrors = {};

var errorLevel = true;
var info = true; // Proxy connection start and end
var debugging = false;
var detail = false;

var proxyConn = 0;
var browserConn = 0;

function claimMemory(reqNum) {
    delete reqUrl[reqNum];
    delete proxyResponseMap[reqNum];
    delete browserRequestMap[reqNum];
}

var statusX = {
    startupTime: new Date(),
    browserRequestMap: browserRequestMap,
    proxyResponseMap: proxyResponseMap,
    reqUrl: reqUrl,
    proxyErrors: proxyErrors,
    browserErrors: browserErrors
};
exports.status = statusX;

/**
 * Https Handling and Delegating Function
 * @param getReqNum
 * @param proxyServerUrl
 * @param proxyServerPort
 * @param request
 * @param socketRequest
 * @param bodyHead
 */
function httpsHandler( getReqNum, proxyServerUrl, proxyServerPort, request, socketRequest, bodyHead ) {
    var reqNum = getReqNum();

    statusX.reqNum = reqNum;

    proxyConn++;
    browserConn++;

    var url = request.url;
    var httpVersion = request.httpVersion;

    // Init size map
    browserRequestMap[reqNum] = 0;
    proxyResponseMap[reqNum] = 0;
    reqUrl[reqNum] = url;

    var hostInfo = getHostAndPort( url, 443/*default port*/ ); // [host, port]
    var targetHost = hostInfo[0];
    var targetPort = hostInfo[1];

    if ( info ) {
        console.log( '  [%d] [HTTPs] [Browser] [Request] %s:%s, [CONN]: %d', reqNum, proxyServerUrl, proxyServerPort, proxyConn );
    }

    // Set up TCP connection to Proxy server
    var proxySocket = new net.Socket();
    proxySocket.connect(
        parseInt( proxyServerPort ),
        proxyServerUrl,
        onProxyServerConnected.bind(null, reqNum, targetHost, targetPort, httpVersion, bodyHead, url, socketRequest, proxySocket)
    );

    /*
     * Proxy Section
     */
    // Pass Proxy server's response back to Browser
    proxySocket.on(
        'data',
        onProxyServerData.bind(null, reqNum, url, socketRequest, proxySocket)
    );

    // Reading from Proxy server error
    proxySocket.on(
        'error',
        onProxyServerError.bind(null, reqNum, url, httpVersion, socketRequest, proxySocket)
    );

    // End of passing Proxy server's response back to Browser
    proxySocket.on(
        'end',
        onProxyServerEnd.bind(null, reqNum, url, socketRequest, proxySocket)
    );

    //// Set TCP timeout
    //setupTcpTimeout(proxySocket);
}

exports.httpsHandler = httpsHandler;

/*
 * Proxy
 */
function onProxyServerConnected(reqNum, targetHost, targetPort, httpVersion, bodyHead, url, socketRequest, proxySocket) {

    proxySocket.isConnected = true;

    if ( info ) {
        console.log( '    [%d] [HTTPs] [Proxy] [Connected] %s:%s, [CONN]: %d', reqNum, targetHost, targetPort, proxyConn);
    }

    // Tell the Browser the connection was successfully established
    socketRequest.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

    // Tell proxy server the targetHost and targetPort, and version (HTTPs)

    proxySocket.write( new Buffer(JSON.stringify({
            host: targetHost,
            port: targetPort,
            httpVersion: httpVersion,
            type: "https",
            reqNum: reqNum
        })).toString('base64') + HEADER_SEPARATOR);

    // Pass the bodyHead from Browser to Proxy server.
    if(bodyHead.length>0) {
        if ( debugging ) {
            console.log('    [%d] [HTTPs] [Browser] bodyHead, length=%d, %s', reqNum, bodyHead.length, url);
        }
        console.log('    [%d] [HTTPs] [Browser] bodyHead, %s, length=%d, %s', reqNum, url, bodyHead.length, bodyHead);
        proxySocket.write( bodyHead );

        browserRequestMap[reqNum] += bodyHead.length;
    }

    /*
     * Requester section, after the proxy socket connected, then try to send data
     */
    // Pass Browser request to Proxy server
    socketRequest.on(
        'data',
        onBrowserData.bind(null, reqNum, url, proxySocket)
    );

    // Reading from Browser error, and close the connection to Proxy server
    socketRequest.on(
        'error',
        onBrowserError.bind(null, reqNum, url, socketRequest, proxySocket)
    );

    // End of passing Browser request to Proxy server
    socketRequest.on(
        'end',
        onBrowserEnd.bind(null, reqNum, url, socketRequest, proxySocket)
    );

    socketRequest.on(
        'close',
        onBrowserClose.bind(null, reqNum, url, socketRequest, proxySocket)
    );
}

function onProxyServerData( reqNum, url, socketRequest, proxySocket, chunk ) {
    if ( debugging ) {
        console.log( '    [%d] [HTTPs] [Proxy] [Data] %d, %s', reqNum, chunk.length, url );
    }

    proxyResponseMap[reqNum] += chunk.length;

    // Return the data back to Browser
    if(!socketRequest.isClosed) {
        socketRequest.write(chunk);
    } else {
        proxySocket.end();
    }
}

function onProxyServerError( reqNum, url, httpVersion, socketRequest, proxySocket, err ) {
    proxySocket.isConnected = false;

    proxyConn--;

    if ( errorLevel ) {
        console.error( '    [%d] [HTTPs] [Proxy] ERR: %s, %s, [CONN]: %d', reqNum, err, url, proxyConn );
    }

    if(url !== "mtalk.google.com:5228" && err.code !== "ECONNRESET") {
        proxyErrors[reqNum] = {
            url: url,
            error: err,
            time: new Date()
        };
    }

    if(!socketRequest.isClosed) {
        socketRequest.write( "HTTPs/" + httpVersion + " 500 Connection error\r\n\r\n" );
        socketRequest.end();
    }

    claimMemory(reqNum);
}

function onProxyServerEnd( reqNum, url, socketRequest, proxySocket ) {
    proxySocket.isConnected = false;

    proxyConn--;

    if (info) {
        console.log('    [%d] [HTTPs] [Proxy] [END] %s, [RESPONSE SIZE]: %d, [CONN]: %d', reqNum, url, proxyResponseMap[reqNum], proxyConn);
    }

    if(!socketRequest.isClosed) {
        socketRequest.end();
    }
}

/*
 * Browser
 */
function onBrowserData( reqNum, url, proxySocket, chunk ) {
    if ( detail ) {
        console.log( '    [%d] [HTTPs] [Browser] %s, [Data] %d', reqNum, url, chunk.length );
    }

    /*
     * Follow setTimeout() is so important,
     * - Because, with out it, the request will send the header and extra string within one chunk, but the encoding issue happens in some ENV, so will not be able to receive the chunk on server side correctly, then incorrect data from server to proxy target will result failure.
     * - setTimeout will break the process into 2 pieces
     */
    setTimeout(function(chunk){
        if(proxySocket.isConnected || proxySocket.isConnected === undefined) {
            browserRequestMap[reqNum] += chunk.length;

            proxySocket.write(chunk);
        }
    }.bind(null, chunk), 500);
}

function onBrowserError( reqNum, url, socketRequest, proxySocket, err ) {
    if(!socketRequest.isClosed) {
        socketRequest.isClosed = true;
        browserConn--;
    }

    if ( errorLevel ) {
        console.error( '  [%d] [HTTPs] [Browser] [ERROR] %s [SEND SIZE] %d [CONN] %d, %s',
            reqNum, url, browserRequestMap[reqNum], browserConn, err );
    }

    browserErrors[reqNum] = {
        url: url,
        error: err,
        time: new Date()
    };

    if(proxySocket.isConnected) {
        proxySocket.end();
    }

    claimMemory(reqNum);
}

function onBrowserEnd( reqNum, url, socketRequest, proxySocket ) {
    if ( info ) {
        console.log( '  [%d] [HTTPs] [Browser] [END] %s [SEND SIZE] %d [CONN] %d',
            reqNum, url, browserRequestMap[reqNum], browserConn );
    }
}

function onBrowserClose( reqNum, url, socketRequest, proxySocket ) {
    if(!socketRequest.isClosed) {
        socketRequest.isClosed = true;
        browserConn--;
    }

    if ( info ) {
        console.log( '  [%d] [HTTPs] [Browser] [CLOSE] %s [SEND SIZE] %d [CONN] %d',
            reqNum, url, browserRequestMap[reqNum], browserConn );
    }

    if(proxySocket.isConnected) {
        proxySocket.end();
    }

    claimMemory(reqNum);
}