/**
 * Created by Hunter on 12/22/2015.
 */
"use strict";

var http = require('http');

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

var connNum = 0;
var dataSize = {};

function claimMemory(seqNum) {
    delete dataSize[seqNum];
}

function closeByError(seqNum, path, error, socket, httpRequest) {
    httpRequest.isClosed = true;
    connNum--;

    if (errorLevel) {
        console.error('    < [%d] [HTTP] [ERROR] %s, [Output Size], %d, [CONN]: %d, %j', seqNum, path, 0, connNum, error);
    }

    if(!socket.isClosed) {
        socket.end(); // Close proxy client
    }

    claimMemory(seqNum);
}
function closeByEnd(seqNum, path, socket, httpRequest) {
    httpRequest.isClosed = true;
    connNum--;

    if (info) {
        console.log('    < [%d] [HTTP] [END] %s, [Output Size], %d, [CONN]: %d', seqNum, path, dataSize[seqNum], connNum);
    }
    if(!socket.isClosed) {
        socket.end(); // Close proxy client
    }

    claimMemory(seqNum);
}
/**
 * Request HTTP target
 * @param seqNum
 * @param socket
 * @param path
 * @param options
 * @returns {*}
 */
function requestHttpTarget(seqNum, socket, path, options) {
    connNum++;

    if(info) {
        console.info("    = [%d] [HTTP] [Request]: %j, [CONN] %d", seqNum, path, connNum);
    }

    dataSize[seqNum] = 0;

    // Http request
    var httpRequest = http.request(
        options,
        function (proxyResponse) {

            if (detail) {
                console.log('    < [%d] [HTTP] [Connected] %s, statusCode: %d, headers: %s', seqNum, path, proxyResponse.statusCode, JSON.stringify(proxyResponse.headers, null, 2));
            }

            else if (info) {
                console.log('    < [%d] [HTTP] [Connected] %s, statusCode: %d', seqNum, path, proxyResponse.statusCode);
            }

            if(!socket.isClosed) {
                // Write header and status out first
                socket.write(new Buffer(JSON.stringify({
                        statusCode: proxyResponse.statusCode,
                        headers: proxyResponse.headers
                    })).toString('base64') + "}");
            }

            proxyResponse.on(
                'data',
                function (chunk) {
                    if (debugging) {
                        console.log('    < [%d] [HTTP] [Data] %s, length=%d', seqNum, path, chunk.length);
                    }

                    if(!socket.isClosed) {
                        socket.write(chunk);
                    } else {
                        httpRequest.abort();
                    }

                    dataSize[seqNum]+= chunk.length;
                }
            );

            proxyResponse.on(
                'end',
                function () {
                    closeByEnd(seqNum, path, socket, httpRequest);
                }
            );

            proxyResponse.on(
                'error',
                function (error) {
                    closeByError(seqNum, path, error, socket, httpRequest);
                }
            );
        }
    );

    // Request to target server error, back the error to caller
    httpRequest.on(
        'error',
        function ( error ) {
            closeByError(seqNum, path, error, socket);
        }
    );

    socket.targetSocket = httpRequest;

    return httpRequest;
}

exports.requestHttpTarget = requestHttpTarget;