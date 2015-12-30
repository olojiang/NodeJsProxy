/**
 * Created by Hunter on 5/6/2015.
 */
"use strict";
var net = require('net');
var http = require('http');

var requestHttpTarget = require('./proxyServerHttp').requestHttpTarget;
var requestHttpsTarget = require('./proxyServerHttps').requestHttpsTarget;
var getReqNumFunc = require('../numberUtil').getReqNumFunc();

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

var HEADER_SEPARATOR = "}";
var END_STRING = "!!!END!!!";

var buf = {};
var bufferInput = {};
var isHttpEnded = {};
var handledHeadInfo = {};
var index = {};
var leftDataToTargetServer = {};
var targetSocket = {};

var clientConn = 0;

function reclaimMemory(seqNum) {
    delete buf[seqNum];
    delete isHttpEnded[seqNum];
    delete bufferInput[seqNum];
    delete handledHeadInfo[seqNum];
    delete index[seqNum];
    delete leftDataToTargetServer[seqNum];
    delete targetSocket[seqNum];
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
    socket.isClosed = true;

    var targetSocketX = targetSocket[seqNum]||socket.targetSocket;
    if (targetSocketX) {

        if(!targetSocketX.isClosed) {
            targetSocketX.end();

            //delete socket.targetSocket;
        }
    }

    reclaimMemory(seqNum);
    clientConn--;

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

    if( !handledHeadInfo[seqNum] ) {
        // Only when we identified key words we will consider the header part is identified.
        var ourDataIndex = chunkString.indexOf(HEADER_SEPARATOR);
        if(ourDataIndex>-1) {
            // Change status
            handledHeadInfo[seqNum] = true;

            var jsonString = bufferInput[seqNum] + chunkString.substring(0, ourDataIndex);

            // Use base64 to decode the header part of the request.
            var header = new Buffer(jsonString, 'base64').toString();

            try {
                //console.info("[Proxy Client], will parse %j", header);
                var obj = JSON.parse(header);
                //console.info("[Proxy Client], will handle %j", obj);
                socket.target = obj;

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

                    //socket.end();
                    //return;

                    var extraString = chunkString.substring(ourDataIndex+1);

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
                    // Connect to target Http server and get things
                    // Send request to target server
                    var path = obj.path;
                    var options = obj.options;
                    targetSocket[seqNum] = requestHttpTarget(seqNum, socket, path, options);

                    leftDataToTargetServer[seqNum] = chunkString.substring(ourDataIndex+1);

                    // Find the end for HTTP as the extra string
                    if( (index[seqNum] = leftDataToTargetServer[seqNum].indexOf(END_STRING)) !== -1 ) {
                        leftDataToTargetServer[seqNum] = leftDataToTargetServer[seqNum].substring(0, index[seqNum]);
                    }

                    // Write some of the body data
                    if(leftDataToTargetServer[seqNum].length>0) {
                        if(detail){
                            console.info("  [%d] [Proxy Client], [Data] %d, to Target server", seqNum, leftDataToTargetServer[seqNum].length);
                        }
                        targetSocket[seqNum].write(leftDataToTargetServer[seqNum]);
                    }

                    // Should end it immediately
                    if(index[seqNum] !== -1 ) {
                        targetSocket[seqNum].end();
                    }
                }

                // If there are some data in buffer
                // - When connection to target is not established, but the data arrived case
                if(buf[seqNum].length>0) {
                    if(detail){
                        console.info("  [%d] [Proxy Client], [Data] %d, to Target server", seqNum, buf[seqNum].length);
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
            console.error("  [%d] [Proxy Client] [%s], Can't find '}'", seqNum, remoteAddress);
            bufferInput[seqNum] += chunkString;
        }
    } else {
        if( (index[seqNum] = chunkString.indexOf(END_STRING)) !== -1) {
            chunk = new Buffer(chunkString.substring(0, index[seqNum]));

            // Close the targetSocket[seqNum] after write all, HTTP Case
            if(targetSocket[seqNum]) {
                targetSocket[seqNum].end();
            } else {
                isHttpEnded[seqNum] = true;
            }
        }

        if(targetSocket[seqNum]) {
            if(chunk.length>0) {
                if(detail){
                    console.info("  [%d] [Proxy Client], [Data] %d, to Target server", seqNum, chunk.length);
                }

                if (
                    (socket.target.type === 'https' && targetSocket[seqNum].isConnected && !targetSocket[seqNum].isClosed) ||
                    (socket.target.type === 'http' && !targetSocket[seqNum].isClosed)
                ) {
                    // If connected, then send request
                    targetSocket[seqNum].write(chunk);
                } else {
                    // If https && not connected, then try to save it, and try to send the data, when socket connected
                    buf[seqNum] = Buffer.concat([buf[seqNum], chunk]);
                    targetSocket[seqNum].buf = Buffer.concat([buf[seqNum], targetSocket[seqNum].buf||new Buffer(0)]);
                    buf[seqNum] = new Buffer(0);
                }
            }
        } else {
            buf[seqNum] = Buffer.concat([buf[seqNum], chunk]);
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
        console.log('[%d] [Proxy Client] [New connection] [%s] [CONN] %d', seqNum, remoteAddress, clientConn);
    }

    targetSocket[seqNum] = null;

    handledHeadInfo[seqNum] = false; // Indicate if the head info has been handled
    index[seqNum] = -1;
    buf[seqNum] = new Buffer(''); // Buffer for client input for output to target HTTP/HTTPs server
    isHttpEnded[seqNum] = false; // Is the client HTTP request ended.
    bufferInput[seqNum]= ''; // If the key value doesn't identified by the value, we need to wait for the value.

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
}

exports.start = startTcpServer;