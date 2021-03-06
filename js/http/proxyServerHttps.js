/**
 * Created by Hunter on 12/22/2015.
 */
"use strict";

var net = require('net');

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

var SOCKET_TIMEOUT = 10*1000;
var MTALK_URL = "mtalk.google.com:5228"; // This used and re-connect again and again by chrome
var MTALK_TIMEOUT = 3*60*1000;

var connNum = 0;
var timeout = {};

var responseDataSize = {};
var reqUrl = {};
var connectedUrl = {};
var targetErrors = {};

var httpsServerStatus = {
    reqUrl: reqUrl,
    connectedUrl: connectedUrl,
    targetErrors: targetErrors,
    responseDataSize: responseDataSize
};

function claimMemory(seqNum) {
    delete responseDataSize[seqNum];
    delete connectedUrl[seqNum];
    delete reqUrl[seqNum];

    if(timeout[seqNum]) {
        clearTimeout(timeout[seqNum]);
        delete timeout[seqNum];
    }
}

function onConnected(seqNum, url, port, socketRequest, proxySocket, extraString) {
    proxySocket.isConnected = true;

    connectedUrl[seqNum] = url+":"+port;

    if (info) {
        console.log('    [%d] [HTTPs] [Connected] %s:%s', seqNum, url, port);
    }

    if (!socketRequest.isClosed) {
        // If there are any data want to send while connection creating
        if (extraString && extraString.length > 0) {
            console.log('    [%d] [HTTPs] [Send Request] %s:%s, %d, %s', seqNum, url, port, extraString.length, extraString);
            proxySocket.write(extraString);
        }

        // If there are any data want to send during the connection creating
        if (proxySocket.buf && proxySocket.buf.length > 0) {
            proxySocket.write(proxySocket.buf);
            proxySocket.buf = new Buffer(0);
        }
    } else {
        console.log('    - [%d] [HTTPs] [Connected] [Abort] %s:%s', seqNum, url, port);
    }
}

function onData(seqNum, chunk, path, socketRequest, proxySocket) {
    if (debugging) {
        console.log('    < [%d] [HTTPs] [Data] %d, %s', seqNum, chunk.length, path);
    }

    responseDataSize[seqNum] += chunk.length;

    // Return the data back to caller, only when it's not closed
    if (!socketRequest.isClosed) {
        socketRequest.write(chunk);

        // Set timeout for the socket clear, after first onData, will try to make sure the server has some data back
        if(timeout[seqNum]) {
            clearTimeout(timeout[seqNum]);
        }

        timeout[seqNum] = setTimeout(function(){
            proxySocket.end();

            if(debugging) {
                console.log('    < [%d] [HTTPs] [Timeout], %s', seqNum, path);
            }

        }, MTALK_URL===path?MTALK_TIMEOUT:SOCKET_TIMEOUT);
    } else {
        proxySocket.end();
    }
}

function closeConnection(seqNum, path, socketRequest, proxySocket, error) {
    if(!proxySocket.isClosed) {
        connNum--;
    }
    proxySocket.isClosed = true;

    if(error) {
        proxySocket.isError = true;
    }

    if( (typeof responseDataSize[seqNum]!=="undefined" && responseDataSize[seqNum] !== null && responseDataSize[seqNum] !== "") || (error) ) {

        if (!socketRequest.isClosed) {
            if (error) {
                socketRequest.write("500 Connection error\r\n");
            }

            socketRequest.end();
        }
    }

    var log = error?console.error:console.log;

    if (info) {
        log('    < [%d] [HTTPs] '+(error?"[ERROR]":"[END]")+', %s, [Output Size], %d, [CONN]: %d' + (error?", Error:":""), seqNum, path, responseDataSize[seqNum], connNum, (error?error:""));
    }

    claimMemory(seqNum);
}

/**
 * Request HTTPs target
 * - by creating tcp connection and sending chunk
 * @param seqNum
 * @param socketRequest
 * @param url
 * @param port
 * @param httpVersion
 * @param extraString
 * @returns {exports.Socket}
 */
function requestHttpsTarget(seqNum, socketRequest, url, port, httpVersion, extraString) {
    responseDataSize[seqNum] = 0;
    reqUrl[seqNum] = url + ":" + port;

    // Set up TCP connection to target server
    var proxySocket = new net.Socket();

    connNum++;

    if(info) {
        console.info("    = [%d] [HTTPs] [Request]: %s:%s, [CONN] %d", seqNum, url, port, connNum);
    }

    proxySocket.connect(
        parseInt( port ), url,
        function () {
            onConnected(seqNum, url, port, socketRequest, proxySocket, extraString);
        }
    );

    var path = url+":"+port;

    // Pass target server's response back to caller
    proxySocket.on(
        'data',
        function ( chunk ) {
            onData(seqNum, chunk, path, socketRequest, proxySocket);
        }
    );

    // Reading from target server error
    proxySocket.on(
        'error',
        function ( err ) {
            if(path !== "mtalk.google.com:5228" && err.code !== "ECONNRESET") {
                targetErrors[seqNum] = {
                    seqNum: seqNum,
                    path: path,
                    time: new Date(),
                    error: err
                };
            }

            closeConnection(seqNum, path, socketRequest, proxySocket, err);
        }
    );

    // End of passing target server's response back to caller
    proxySocket.on(
        'end',
        function () {
            closeConnection(seqNum, path, socketRequest, proxySocket);
        }
    );

    socketRequest.targetSocket = proxySocket;

    return proxySocket;
}

exports.httpsServerStatus = httpsServerStatus;
exports.requestHttpsTarget = requestHttpsTarget;