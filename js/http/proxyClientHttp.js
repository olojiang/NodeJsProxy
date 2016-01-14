/**
 * Created by Hunter on 12/21/2015.
 */

"use strict";

var net = require('net');
var url=require('url');

var setupTcpTimeout = require('../socketUtil').setupTcpTimeout;

var sizeResponseMap = {};
var sizeRequestMap = {};

var browserEnd = {};
var responseDataBuffer = {};
var reqUrl = {};
var responseStatus = {};

var proxyErrors = {};
var browserErrors = {};

var aliveConn = 0;

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

function claimMemory(reqNum) {
    delete responseDataBuffer[reqNum];
    delete browserEnd[reqNum];
    delete sizeRequestMap[reqNum];
    delete sizeResponseMap[reqNum];
    delete reqUrl[reqNum];
    delete responseStatus[reqNum];
}

var statusX = {
    startupTime: new Date(),
    reqUrl: reqUrl,
    responseDataBuffer: responseDataBuffer,
    browserEnd: browserEnd,
    responseStatus: responseStatus,
    sizeResponseMap: sizeResponseMap,
    sizeRequestMap: sizeRequestMap,
    proxyErrors: proxyErrors,
    browserErrors: browserErrors
};
var httpStatus = statusX;

function writeChunk(userRequest, userResponse, chunk, reqNum) {
    if(!userRequest.isClosed) {
        userResponse.write(chunk);
    }

    // Count actual body size
    sizeResponseMap[reqNum] += chunk.length + sizeResponseMap[reqNum];
}

function proxy_client_status(userResponse, httpsStatus) {
    userResponse.end(JSON.stringify({
        http: httpStatus,
        https: httpsStatus
    }));
}

function proxy_client_remove_errors(userResponse, httpsStatus) {
    httpStatus.proxyErrors = {};
    httpStatus.browserErrors = {};
    httpsStatus.proxyErrors = {};
    httpsStatus.browserErrors = {};

    userResponse.end(JSON.stringify({
        http: httpStatus,
        https: httpsStatus
    }));
}

/**
 * Http Handling and Delegating function
 * - It will not handle, if it's other request, like HTTPS.
 * @param getReqNum
 * @param proxyServerUrl
 * @param proxyServerPort
 * @param httpsStatus
 * @param userRequest
 * @param userResponse
 */
function httpHandler( getReqNum, proxyServerUrl, proxyServerPort, httpsStatus, userRequest, userResponse ) {
    var reqNum = getReqNum();

    statusX.reqNum = reqNum;

    if ( info ) {
        console.log( '  [%d] [HTTP] [Browser] [Request] url: %s', reqNum, userRequest.url );
    }

    var headers = userRequest.headers;
    var httpVersion = userRequest.httpVersion;
    var httpHost = headers.host;
    var httpPort = 80;

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

    /*
     * Get the status of client HTTP proxy
     */
    if(opt.path==="/proxy_client_status") {
        proxy_client_status(userResponse, httpsStatus);
        return;
    } else if(opt.path==="/proxy_client_remove_errors") {
        proxy_client_remove_errors(userResponse, httpsStatus);
        return;
    }

    reqUrl[reqNum] = userRequest.url;
    responseDataBuffer[reqNum] = '';

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
        onProxyServerConnected.bind(null, reqNum, proxyServerUrl, proxyServerPort, options, path, proxySocket, userRequest)
    );

    /*
     * Proxy Section
     */
    // Pass Proxy server's response back to Browser
    proxySocket.on(
        'data',
        onProxyServerData.bind(null, reqNum, path, userRequest, userResponse, proxySocket)
    );

    // Reading from Proxy server error
    proxySocket.on(
        'error',
        onProxyServerError.bind(null, reqNum, path, httpVersion, userRequest, userResponse, proxySocket)
    );

    // End of passing Proxy server's response back to Browser
    proxySocket.on(
        'end',
        onProxyServerEnd.bind(null, reqNum, path, userRequest, userResponse, proxySocket)
    );

    //// Setup TCP timeout
    //setupTcpTimeout(proxySocket);
}

exports.httpHandler = httpHandler;

function onProxyServerConnected(reqNum, proxyServerUrl, proxyServerPort, options, path, proxySocket, userRequest) {
    proxySocket.isConnected = true;

    if ( info ) {
        console.log( '    [%d] [HTTP] [Proxy] [Connected] to %s:%s / %s, [CONN] %d', reqNum, proxyServerUrl, proxyServerPort, path, aliveConn );
    }

    // Init size map
    sizeResponseMap[reqNum] = 0;
    sizeRequestMap[reqNum] = 0;

    // Tell the Browser the connection was successfully established
    //userResponse.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

    // Tell proxy server the HTTP request Header, and path (HTTP)
    proxySocket.write( new Buffer(JSON.stringify({
            options: options,
            path: path,
            type: "http",
            reqNum: reqNum
        })).toString('base64') + "}");

    /*
     * Browser Section
     */
    userRequest.addListener(
        'data',
        onBrowserData.bind(null, reqNum, path, proxySocket)
    );

    userRequest.addListener(
        'end',
        onBrowserEnd.bind(null, reqNum, path, proxySocket)
    );

    /*
     * Browser side error for the request
     */
    userRequest.addListener(
        'error',
        onBrowserError.bind(null, reqNum, path, proxySocket, userRequest)
    );

    /*
     * Browser side closed the connection
     */
    userRequest.on('close',
        onBrowserClose.bind(null, reqNum, path, proxySocket, userRequest)
    );
}

function onProxyServerData( reqNum, path, userRequest, userResponse, proxySocket, chunk ) {
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
            //console.info("Before parse: index=%d, %s", index, responseDataBuffer[reqNum] + headerChunkString);
            headerString = new Buffer(responseDataBuffer[reqNum] + headerChunkString, 'base64').toString();
            //console.info("headerString=%s", headerString);
            try {
                // Status code and Header handling
                var proxyResponse = JSON.parse(headerString);

                responseStatus[reqNum] = proxyResponse.statusCode;

                // Send the header back
                if(!userRequest.isClosed) {
                    userResponse.writeHead(
                        proxyResponse.statusCode,
                        proxyResponse.headers
                    );
                }

                // Extra text output
                chunk = chunk.slice(headerChunkString.length+1);
                if(chunk.length!==0) {
                    // Only write it when there are still something left after header part handled
                    writeChunk(userRequest, userResponse, chunk, reqNum);
                }
            } catch(e) {
                console.error("    [%d] [HTTP] [Proxy] [Data] JSON.parse(%j), [ERROR], %j", reqNum, headerString, e);
            }
        } else {
            console.warn("    [%d] [HTTP] [Proxy] [Data] format warn, can't find '}', [Warning]: %d", reqNum, chunkString.length);
            responseDataBuffer[reqNum] += chunkString;
        }
    } else {
        // Return the data back to Browser
        writeChunk(userRequest, userResponse, chunk, reqNum);
    }
}

function onProxyServerError( reqNum, path, httpVersion, userRequest, userResponse, err, proxySocket ) {
    proxySocket.isConnected = false;

    if(reqUrl[reqNum]) {
        aliveConn--;

        if(!userRequest.isClosed) {
            userResponse.writeHead(500);
            userResponse.write("HTTPs/" + httpVersion + " 500 Connection error\r\n\r\n");
            userResponse.end();
        }

        claimMemory(reqNum);
    }

    proxyErrors[reqNum] = {
        path: path,
        error: err,
        time: new Date()
    };

    if ( errorLevel ) {
        console.error( '    [%d] [HTTP] [Proxy], [ERROR]: %j, %j, [CONN]: %d', reqNum, err, path, aliveConn );
    }
}

function onProxyServerEnd(reqNum, path, userRequest, userResponse, proxySocket) {
    proxySocket.isConnected = false;

    aliveConn--;

    if ( info ) {
        var log = sizeResponseMap[reqNum]===0 && responseStatus[reqNum]!==304?console.error:console.log;
        log( '    [%d] [HTTP] [Proxy], [END], %j, [Response Size] %d, [CONN]: %d, [Status Code] %s', reqNum, path, sizeResponseMap[reqNum], aliveConn, responseStatus[reqNum] );
    }

    if(!userRequest.isClosed) {
        userResponse.end();
    }

    claimMemory(reqNum);
}

function onBrowserData(reqNum, path, proxySocket, chunk) {
    if ( debugging ) {
        console.info( '  [%d] [HTTP] [Browser] %s, [Data] length=%d', reqNum, path, chunk.length );
    }

    sizeRequestMap[reqNum] += chunk.length;

    if(proxySocket.isConnected) {
        proxySocket.write(chunk);
    }
}

function onBrowserEnd(reqNum, path, proxySocket) {
    if ( info ) {
        console.info( '  [%d] [HTTP] [Browser] [END] %s', reqNum, path );
    }

    if(proxySocket.isConnected) {
        proxySocket.write( "!!!END!!!" );
    }

    browserEnd[reqNum] = true;
}

function onBrowserError(reqNum, path, proxySocket, error, userRequest) {
    userRequest.isClosed = true;

    if ( errorLevel ) {
        console.info( '  [%d] [HTTP] [Browser] [ERROR] %s, %j', reqNum, path, error );
    }

    browserErrors[reqNum] = {
        path: path,
        error: error,
        time: new Date()
    };

    if( proxySocket.isConnected ) {
        proxySocket.end();
    }
}

function onBrowserClose(reqNum, path, proxySocket, userRequest){
    userRequest.isClosed = true;

    if ( info ) {
        console.info('  [%d] [HTTP] [Browser] [CLOSE] %s', reqNum, path);
    }

    if( proxySocket.isConnected ) {
        proxySocket.end();
    }
}