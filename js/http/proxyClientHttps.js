/**
 * Created by Hunter on 12/21/2015.
 */

"use strict";

var net = require('net');

var setupTcpTimeout = require('../socketUtil').setupTcpTimeout;
var getHostAndPort = require('../urlUtil').getHostAndPort;

var sizeResponseMap = {};
var sizeRequestMap = {};

var errorLevel = true;
var info = true; // Proxy connection start and end
var debugging = false;
var detail = false;

var aliveConn = 0;

function onProxyServerConnected(reqNum, targetHost, targetPort, httpVersion, bodyHead, url, socketRequest, proxySocket) {

    if ( info ) {
        console.log( '  - [%d] [HTTPs] request to %s/%s, [CONN]: %d', reqNum, targetHost, targetPort, aliveConn);
    }

    // Init size map
    sizeResponseMap[reqNum] = 0;

    // Tell the Browser the connection was successfully established
    socketRequest.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

    // Tell proxy server the targetHost and targetPort, and version (HTTPs)
    proxySocket.write( new Buffer(JSON.stringify({
            host: targetHost,
            port: targetPort,
            httpVersion: httpVersion,
            type: "https"
        })).toString('base64') + "}");

    // Pass the bodyHead from Browser to Proxy server.
    if(bodyHead.length!==0) {
        if ( debugging ) {
            console.log('    > HTTPs bodyHead from Browser, length=%d, %s', bodyHead.length, url);
        }
        proxySocket.write( bodyHead );
    }
}

function onProxyServerData( reqNum, url, socketRequest, chunk ) {
    if ( debugging ) {
        console.log( '    < [%d] HTTPs From Proxy Server, length=%d, %s', reqNum, chunk.length, url );
    }

    sizeResponseMap[reqNum] = sizeResponseMap[reqNum] + chunk.length;

    // Return the data back to Browser
    socketRequest.write( chunk );
}

function onProxyServerError( reqNum, url, httpVersion, socketRequest, err ) {
    socketRequest.write( "HTTPs/" + httpVersion + " 500 Connection error\r\n\r\n" );

    aliveConn--;

    if ( errorLevel ) {
        console.error( '    < [%d] HTTPs From Proxy Server, ERR: %s, %s, [CONN]: %d', reqNum, err, url, aliveConn );
    }
    socketRequest.end();
}

function onProxyServerEnd( reqNum, url, socketRequest ) {
    aliveConn--;

    if (info) {
        console.log('    < [%d] HTTPs From Proxy Server, END, %s, totalResponseSize: %d, [CONN]: %d', reqNum, url, sizeResponseMap[reqNum], aliveConn);
    }

    socketRequest.end();
}

function onBrowserData( reqNum, url, proxySocket, chunk ) {
    if ( detail ) {
        console.log( '    > [%d] HTTPs From Browser, %s, length=%d', reqNum, url, chunk.length );
    }

    proxySocket.write( chunk );
}

function onBrowserError( reqNum, url, proxySocket, err ) {
    if ( errorLevel ) {
        console.error( '  > [%d] HTTPs From Browser, %s, ERR: %s', reqNum, url, err );
    }
    proxySocket.end();
}

function onBrowserEnd( reqNum, url, proxySocket ) {
    if ( info ) {
        console.log( '    < [%d] HTTPs From Browser, %s, END', reqNum, url );
    }

    proxySocket.end();
}

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

    aliveConn++;

    var url = request.url;
    var httpVersion = request.httpVersion;

    var hostInfo = getHostAndPort( url, 443/*default port*/ ); // [host, port]
    var targetHost = hostInfo[0];
    var targetPort = hostInfo[1];

    if ( debugging ) {
        console.log( ' = Will connect to %s:%s', proxyServerUrl, proxyServerPort );
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
        onProxyServerData.bind(null, reqNum, url, socketRequest)
    );

    // Reading from Proxy server error
    proxySocket.on(
        'error',
        onProxyServerError.bind(null, reqNum, url, httpVersion, socketRequest)
    );

    // End of passing Proxy server's response back to Browser
    proxySocket.on(
        'end',
        onProxyServerEnd.bind(null, reqNum, url, socketRequest)
    );

    //// Set TCP timeout
    //setupTcpTimeout(proxySocket);

    /*
     * Requester section
     */
    // Pass Browser request to Proxy server
    socketRequest.on(
        'data',
        onBrowserData.bind(null, reqNum, url, proxySocket)
    );

    // Reading from Browser error, and close the connection to Proxy server
    socketRequest.on(
        'error',
        onBrowserError.bind(null, reqNum, url, proxySocket)
    );

    // End of passing Browser request to Proxy server
    socketRequest.on(
        'end',
        onBrowserEnd.bind(null, reqNum, url, proxySocket)
    );
}

exports.httpsHandler = httpsHandler;