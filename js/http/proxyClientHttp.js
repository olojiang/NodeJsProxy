/**
 * Created by Hunter on 12/21/2015.
 */

"use strict";

var net = require('net');
var url=require('url');

var setupTcpTimeout = require('../socketUtil').setupTcpTimeout;

var sizeResponseMap = {};
var sizeRequestMap = {};

var tcpConnectionEstablished = {};
var httpRequestEnd = {};
var buf = {};

var aliveConn = 0;

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

function claimMemory(reqNum) {
    delete buf[reqNum];
}

function writeChunk(userResponse, chunk, reqNum) {
    userResponse.write(chunk);

    // Count actual body size
    sizeResponseMap[reqNum] += chunk.length + sizeResponseMap[reqNum];
}

/**
 * Http Handling and Delegating function
 * - It will not handle, if it's other request, like HTTPS.
 * @param getReqNum
 * @param proxyServerUrl
 * @param proxyServerPort
 * @param userRequest
 * @param userResponse
 */
function httpHandler( getReqNum, proxyServerUrl, proxyServerPort, userRequest, userResponse ) {
    var reqNum = getReqNum();

    if ( debugging ) {
        console.log( '  [%d] [HTTP] [Browser] [Request] url: %s', reqNum, userRequest.url );
    }

    var headers = userRequest.headers;
    var httpVersion = userRequest.httpVersion;
    var httpHost = headers.host;
    var httpPort = 80;
    httpRequestEnd[reqNum] = false;
    tcpConnectionEstablished[reqNum] = false;

    // have to extract the path from the requested URL
    var path = userRequest.url;
    var opt = url.parse(path);

    var options = {
        'host': httpHost,
        'port': httpPort,
        'method': userRequest.method,
        'path': opt.path,
        'agent': userRequest.agent,
        'auth': userRequest.auth,
        'headers': headers
    };

    buf[reqNum] = '';

    if ( detail ) {
        console.log( '    [%d] [HTTP] [Proxy] [Request] to Proxy server %s options: %s', reqNum, path, JSON.stringify( options, null, 2 ) );
    }

    aliveConn++;

    // Set up TCP connection to Proxy server
    var proxySocket = new net.Socket();
    proxySocket.noDataYet = true;
    proxySocket.connect(
        parseInt( proxyServerPort ),
        proxyServerUrl,
        onProxyServerConnected.bind(null, reqNum, proxyServerUrl, proxyServerPort, options, path, proxySocket)
    );

    /*
     * Proxy Section
     */
    // Pass Proxy server's response back to Browser
    proxySocket.on(
        'data',
        onProxyServerData.bind(null, reqNum, path, userResponse, proxySocket)
    );

    // Reading from Proxy server error
    proxySocket.on(
        'error',
        onProxyServerError.bind(null, reqNum, path, httpVersion, userResponse)
    );

    // End of passing Proxy server's response back to Browser
    proxySocket.on(
        'end',
        onProxyServerEnd.bind(null, reqNum, path, userResponse)
    );

    //// Setup TCP timeout
    //setupTcpTimeout(proxySocket);

    /*
     * Browser Section
     */
    userRequest.addListener(
        'data',
        onBrowserData.bind(null, reqNum, path, proxySocket)
    );

    userRequest.addListener(
        'error',
        onBrowserError.bind(null, reqNum, path, proxySocket)
    );

    userRequest.addListener(
        'end',
        onBrowserEnd.bind(null, reqNum, path, proxySocket)
    );

    /*
     * Browser side closed the connection
     */
    userResponse.on('close',
        onBrowserClose.bind(null, reqNum, path, proxySocket)
    );
}

exports.httpHandler = httpHandler;

function onProxyServerConnected(reqNum, proxyServerUrl, proxyServerPort, options, path, proxySocket) {
    if ( info ) {
        console.log( '    [%d] [HTTP] [Proxy] [Connected] to %s:%s / %s, [CONN] %d', reqNum, proxyServerUrl, proxyServerPort, path, aliveConn );
    }

    // Init size map
    sizeResponseMap[reqNum] = 0;

    // Tell the Browser the connection was successfully established
    //userResponse.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

    // Tell proxy server the HTTP request Header, and path (HTTP)
    proxySocket.write( new Buffer(JSON.stringify({
            options: options,
            path: path,
            type: "http",
            reqNum: reqNum
        })).toString('base64') + "}");

    tcpConnectionEstablished[reqNum] = true;
    if( httpRequestEnd[reqNum] ) {
        proxySocket.write( "!!!END!!!" );
    }
}

function onProxyServerData( reqNum, path, userResponse, proxySocket, chunk ) {
    if ( debugging ) {
        console.log( '    [%d] [HTTP] [Proxy], length=%d, %j', reqNum, chunk.length, path );
    }

    if( proxySocket.noDataYet ) {
        var chunkString = chunk.toString();
        var index = chunkString.indexOf("}");

        var headerString = null;

        if(index !== -1) {
            proxySocket.noDataYet = false;
            var headerChunkString = chunkString.substring(0, index);
            //console.info("Before parse: index=%d, %s", index, buf[reqNum] + headerChunkString);
            headerString = new Buffer(buf[reqNum] + headerChunkString, 'base64').toString();
            //console.info("headerString=%s", headerString);
            try {
                // Status code and Header handling
                var proxyResponse = JSON.parse(headerString);

                // Send the header back
                userResponse.writeHead(
                    proxyResponse.statusCode,
                    proxyResponse.headers
                );

                // Extra text output
                chunk = chunk.slice(headerChunkString.length+1);
                if(chunk.length!==0) {
                    // Only write it when there are still something left after header part handled
                    writeChunk(userResponse, chunk, reqNum);
                }
            } catch(e) {
                console.error("    [%d] [HTTP] [Proxy] [Data] JSON.parse(%j), [ERROR], %j", reqNum, headerString, e);
            }
        } else {
            console.warn("    [%d] [HTTP] [Proxy] [Data] format warn, can't find '}', [Warning]: %d", reqNum, chunkString.length);
            buf[reqNum] += chunkString;
        }
    } else {
        // Return the data back to Browser
        writeChunk(userResponse, chunk, reqNum);
    }
}

function onProxyServerError( reqNum, path, httpVersion, userResponse, err ) {

    if(buf[reqNum]) {
        aliveConn--;

        userResponse.writeHead( 500 );
        userResponse.write( "HTTPs/" + httpVersion + " 500 Connection error\r\n\r\n" );
        userResponse.end();

        claimMemory(reqNum);
    }

    if ( errorLevel ) {
        console.error( '    [%d] [HTTP] [Proxy], [ERROR]: %j, %j, [CONN]: %d', reqNum, err, path, aliveConn );
    }
}

function onProxyServerEnd(reqNum, path, userResponse) {
    aliveConn--;

    if ( info ) {
        console.log( '    [%d] [HTTP] [Proxy], [END], %j, totalResponseSize = %d, [CONN]: %d', reqNum, path, sizeResponseMap[reqNum], aliveConn );
    }
    userResponse.end();

    claimMemory(reqNum);
}

function onBrowserData(reqNum, path, proxySocket, chunk) {
    if ( debugging ) {
        console.info( '  [%d] [HTTP] [Browser] %s, [Data] length=%d', reqNum, path, chunk.length );
    }
    proxySocket.write( chunk );
}

function onBrowserError(reqNum, path, proxySocket, error) {
    if ( errorLevel ) {
        console.info( '  [%d] [HTTP] [Browser] [ERROR] %s, %j', reqNum, path, error );
    }
    proxySocket.end();
}

function onBrowserEnd(reqNum, path, proxySocket) {
    if ( info ) {
        console.info( '  [%d] [HTTP] [Browser] [END] %s', reqNum, path );
    }

    httpRequestEnd[reqNum] = true;
    if( tcpConnectionEstablished[reqNum] ) {
        proxySocket.write( "!!!END!!!" );
    }
}

function onBrowserClose(reqNum, path, proxySocket){
    if ( info ) {
        console.info('  [%d] [HTTP] [Browser] [CLOSE] %s', reqNum, path);
    }
    httpRequestEnd[reqNum] = true;
    proxySocket.end();
}