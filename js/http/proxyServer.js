/**
 * Created by Hunter on 5/6/2015.
 */
"use strict";
var net = require('net');
var http = require('http');

var requestHttpTarget = require('./proxyServerHttp').requestHttpTarget;
var httpServerStatus = require('./proxyServerHttp').httpServerStatus;
var requestHttpsTarget = require('./proxyServerHttps').requestHttpsTarget;
var httpsServerStatus = require('./proxyServerHttps').httpsServerStatus;
var getReqNumFunc = require('../numberUtil').getReqNumFunc();

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

var HEADER_SEPARATOR = "}";
var END_STRING = "!!!END!!!";

var buf = {};
var clientDataBuffer = {};
var isHttpEnded = {};
var handledHeadInfo = {};
var leftDataToTargetServer = {};
var targetSocket = {};
var targetObject = {};
var foundHttpEndString = {};

var clientConn = 0;

httpServerStatus.foundHttpEndString = foundHttpEndString;

var clientStatus = {
    targetObject: targetObject,
    leftDataToTargetServer: leftDataToTargetServer,
    handledHeadInfo: handledHeadInfo,
    httpServerStatus: httpServerStatus,
    httpsServerStatus: httpsServerStatus
};

var _ = require('underscore');

function reclaimMemory(seqNum) {
    delete buf[seqNum];
    delete isHttpEnded[seqNum];
    delete foundHttpEndString[seqNum];
    delete clientDataBuffer[seqNum];
    delete handledHeadInfo[seqNum];
    delete leftDataToTargetServer[seqNum];
    delete targetSocket[seqNum];
    delete targetObject[seqNum];
}

/**
 * Close client socket
 * - From, client closed, need to close target socket
 * - From, client error, need to close target socket
 * - Target Socket, close
 * - Target Socket, end
 * @param socket
 * @param seqNum
 * @param remoteAddress
 * @param error
 */
function closeClientSocket(socket, seqNum, remoteAddress, error) {
    // Mark client socket has ended
    if( !socket.isClosed ) {
        clientConn--;
    }
    socket.isClosed = true;

    var targetSocketX = targetSocket[seqNum]||socket.targetSocket;
    if (targetSocketX) {

        if(!targetSocketX.isClosed) {
            targetSocketX.abort();
        }
    }

    reclaimMemory(seqNum);

    var log = error?console.error:console.log;

    if (info) {
        log("  [%d] [Proxy Client] ["+(error?"ERROR":"END")+"], FROM %s, [CONN]: %d"+(error?', Error: %j':''), seqNum, remoteAddress, clientConn, error?error:'');
    }
}

/**
 * On client socket data
 * - If Http, use http to request the data
 * - If Https, try to forward the request
 * @param seqNum
 * @param remoteAddress
 * @param socket
 * @param chunk
 */
function onClientSocketData(seqNum, remoteAddress, socket, chunk){
    var chunkString = chunk.toString();
    var index = -1;

    if( !handledHeadInfo[seqNum] ) {
        // Only when we identified key words we will consider the header part is identified.
        var ourDataIndex = chunkString.indexOf(HEADER_SEPARATOR);
        if(ourDataIndex>-1) {
            // Change status
            handledHeadInfo[seqNum] = true;

            var jsonString = clientDataBuffer[seqNum] + chunkString.substring(0, ourDataIndex);

            // Use base64 to decode the header part of the request.
            var header = new Buffer(jsonString, 'base64').toString();

            try {
                var obj = JSON.parse(header);
                socket.target = obj;

                // Save the target object for status
                targetObject[seqNum] = _.clone(obj);
                delete targetObject[seqNum].options;

                leftDataToTargetServer[seqNum]= '';

                if(obj.type === "https") {
                    // Get target
                    /*
                     {
                     host: targetHost,
                     port: targetPort,
                     httpVersion: httpVersion,
                     type: "https"
                     }
                     */

                    var extraString = chunkString.substring(ourDataIndex+1);
                    if(extraString.length>0 || debugging) {
                        console.info("    [%d] [Proxy Client], [Data] [Extra String] %d", seqNum, extraString.length);
                    }

                    // Connect to target Https server and get things
                    targetSocket[seqNum] = requestHttpsTarget(seqNum, socket, obj.host, obj.port, obj.httpVersion, extraString);

                } else {
                    // Get target
                    /*
                     {
                     path: path,
                     options: options,
                     type: "http"
                     }
                     */
                    leftDataToTargetServer[seqNum] = chunkString.substring(ourDataIndex+1);

                    // Connect to target Http server and get things
                    // Send request to target server
                    var path = obj.path;
                    var options = obj.options;
                    targetSocket[seqNum] = requestHttpTarget(seqNum, socket, path, options);

                    // Find the end for HTTP as the extra string
                    if( (index = leftDataToTargetServer[seqNum].indexOf(END_STRING)) !== -1 ) {
                        foundHttpEndString[seqNum] = true;
                        leftDataToTargetServer[seqNum] = leftDataToTargetServer[seqNum].substring(0, index);
                    }

                    // Write some of the body data
                    if(leftDataToTargetServer[seqNum].length>0) {
                        if(detail){
                            console.info("    [%d] [Proxy Client], [Data] %d, to Target server", seqNum, leftDataToTargetServer[seqNum].length);
                        }
                        targetSocket[seqNum].write(leftDataToTargetServer[seqNum]);
                    }

                    // Should end it immediately
                    if(index !== -1 ) {
                        targetSocket[seqNum].end();
                    }
                }

                // If there are some data in buffer
                // - When connection to target is not established, but the data arrived case
                if(buf[seqNum].length>0) {
                    if(detail){
                        console.info("    [%d] [Proxy Client], [Data] %d, to Target server", seqNum, buf[seqNum].length);
                    }
                    targetSocket[seqNum].write(buf[seqNum]);
                    buf[seqNum] = new Buffer(0);
                }

                // Http is ended find
                // - When connection to target is not established, but the data arrived to say the game ended
                if(isHttpEnded[seqNum]) {
                    targetSocket[seqNum].end();
                }
            } catch(e) {
                console.trace(e);
            }
        } else {
            // There is the content from client, but there is no } within the input, which means the input may be longer, and the algorithm doesn't work.
            console.error("    [%d] [Proxy Client] [%s], Can't find '}'", seqNum, remoteAddress);
            clientDataBuffer[seqNum] += chunkString;
        }
    } else {
        /*
         * After handled head info
         */

        if( (index = chunkString.indexOf(END_STRING)) !== -1) {
            foundHttpEndString[seqNum] = true;
            console.info("After handled head string, chunkString:", chunkString);

            chunk = new Buffer(chunkString.substring(0, index));

            if( !targetSocket[seqNum].isClosed ) {
                targetSocket[seqNum].write(chunk);
            }
        }

        var tSocket = targetSocket[seqNum];
        if(tSocket) {
            if(chunk.length>0) {
                if(detail){
                    console.info("    [%d] [Proxy Client], [Data] %d, to Target server", seqNum, chunk.length);
                }

                if (
                    (socket.target.type === 'https' && tSocket.isConnected && !tSocket.isClosed) ||
                    (socket.target.type === 'http' && !tSocket.isClosed)
                ) {
                    // If connected, then send request
                    tSocket.write(chunk);
                } else {
                    // If https && not connected, then try to save it, and try to send the data, when socket connected
                    buf[seqNum] = Buffer.concat([buf[seqNum], chunk]);
                    tSocket.buf = Buffer.concat([buf[seqNum], tSocket.buf||new Buffer(0)]);
                    buf[seqNum] = new Buffer(0);
                }
            }
        } else {
            buf[seqNum] = Buffer.concat([buf[seqNum], chunk]);
        }

        if( index !== -1) {
            // Close the targetSocket[seqNum] after write all, HTTP Case
            if (targetSocket[seqNum]) {
                targetSocket[seqNum].end();
            } else {
                isHttpEnded[seqNum] = true;
            }
        }
    }
}

/**
 * On client socket error
 * - Target connection should end
 * @param socket
 * @param seqNum
 * @param remoteAddress
 */
function onClientSocketError(socket, seqNum, remoteAddress) {
    socket.on('error', function (error) {
        closeClientSocket(socket, seqNum, remoteAddress, error);
    });
}

/**
 * On client socket end
 * - Target connection should end
 * @param socket
 * @param seqNum
 * @param remoteAddress
 */
function onClientSocketEnd(socket, seqNum, remoteAddress) {
    socket.on('end', function () {
        closeClientSocket(socket, seqNum, remoteAddress);
    });
}

/**
 * After TCP connection accessed this server
 * @param socket
 */
function onClientSocketConnection(socket){
    var seqNum = getReqNumFunc();

    var remoteAddress = socket.remoteAddress;

    clientConn++;

    if(info) {
        console.log('  [%d] [Proxy Client] [New connection] [%s] [CONN] %d', seqNum, remoteAddress, clientConn);
    }

    targetSocket[seqNum] = null;

    handledHeadInfo[seqNum] = false; // Indicate if the head info has been handled
    buf[seqNum] = new Buffer(''); // Buffer for client input for output to target HTTP/HTTPs server
    isHttpEnded[seqNum] = false; // Is the client HTTP request ended.
    clientDataBuffer[seqNum]= ''; // If the key value doesn't identified by the value, we need to wait for the value.

    socket.on('data',
        onClientSocketData.bind(null, seqNum, remoteAddress, socket));

    onClientSocketError(socket, seqNum, remoteAddress);
    onClientSocketEnd(socket, seqNum, remoteAddress);
}

/**
 * Start TCP server
 * @param port
 */
var simpleServer = require('../net/simpleServer');
function startTcpServer(port){
    simpleServer.listen(port, onClientSocketConnection);

    /*
     * Http Status server
     */
    var statusServerPort = 47777;
    http.createServer(function(request, response){
        var url = request.url;

        response.end(JSON.stringify({
            clientStatus: clientStatus
        }));
    }).listen(statusServerPort);
}

exports.start = startTcpServer;