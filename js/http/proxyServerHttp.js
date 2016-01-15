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
var responseDataSize = {};
var reqUrl = {};
var connectedUrl = {};
var targetErrors = {};

var httpServerStatus = {
    reqUrl: reqUrl,
    connectedUrl: connectedUrl,
    responseDataSize: responseDataSize,
    targetErrors: targetErrors
};

function claimMemory(seqNum) {
    delete responseDataSize[seqNum];
    delete reqUrl[seqNum];
    delete connectedUrl[seqNum];
    delete targetErrors[seqNum];
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
        console.log('    < [%d] [HTTP] [END] %s, [Output Size], %d, [CONN]: %d', seqNum, path, responseDataSize[seqNum], connNum);
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

    responseDataSize[seqNum] = 0;
    reqUrl[seqNum] = path;

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

            connectedUrl[seqNum] = path;

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

                    responseDataSize[seqNum]+= chunk.length;

                    if(!socket.isClosed) {
                        socket.write(chunk);
                    } else {
                        httpRequest.abort();
                    }
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
                    targetErrors[seqNum] = {
                        seqNum: seqNum,
                        path: path,
                        time: new Date(),
                        error: error,
                        type: 'targetServer'
                    };

                    closeByError(seqNum, path, error, socket, httpRequest);
                }
            );
        }
    );

    // Request to target server error, back the error to caller
    httpRequest.on(
        'error',
        function ( error ) {
            targetErrors[seqNum] = {
                seqNum: seqNum,
                path: path,
                time: new Date(),
                error: error,
                type: 'connect'
            };

            closeByError(seqNum, path, error, socket, httpRequest);
        }
    );

    socket.targetSocket = httpRequest;

    return httpRequest;
}

exports.httpServerStatus = httpServerStatus;
exports.requestHttpTarget = requestHttpTarget;