/**
 * Created by Hunter on 5/6/2015.
 */
"use strict";
var net = require('net');
var http = require('http');

var error = true;
var debugging = true;
var detail = false;

/**
 * Request HTTPs target
 * - by creating tcp connection and sending chunk
 * @param socketRequest
 * @param url
 * @param port
 * @param httpVersion
 * @returns {exports.Socket}
 */
function requestHttpsTarget(socketRequest, url, port, httpVersion){
    // Set up TCP connection to target server
    var proxySocket = new net.Socket();
    proxySocket.connect(
        parseInt( port ), url,
        function () {
            if ( debugging ) {
                console.log( '  - HTTPs Connected to %s/%s', url, port );
            }
        }
    );

    var path = url+":"+port;

    // Pass target server's response back to caller
    proxySocket.on(
        'data',
        function ( chunk ) {
            if ( debugging ) {
                console.log( '    < HTTPs From Target, length=%d, %s', chunk.length, path );
            }

            // Return the data back to caller
            socketRequest.write( chunk );
        }
    );

    // Reading from target server error
    proxySocket.on(
        'error',
        function ( err ) {
            socketRequest.write( "HTTP/" + httpVersion + " 500 Connection error\r\n\r\n" );
            if ( error ) {
                console.error( '    < HTTPs From Target, ERR: %j, %j, ', err, path );
            }
            socketRequest.end();
        }
    );

    // End of passing target server's response back to caller
    proxySocket.on(
        'end',
        function () {
            if ( debugging ) {
                console.log( '    < HTTPs From Target, END, %s', path );
            }

            socketRequest.end();
        }
    );

    return proxySocket;
}

/**
 * Request HTTP target
 * @param socket
 * @param path
 * @param options
 * @returns {*}
 */
function requestHttpTarget(socket, path, options) {
    console.info("== Http Request to: %j", path);

    // Http request
    return http.request(
        options,
        function (proxyResponse) {
            if (detail) {
                console.log('  < HTTP response from target server %s, statusCode: %d, headers: %s', path, proxyResponse.statusCode, JSON.stringify(proxyResponse.headers, null, 2));
            } else {
                console.log('  < HTTP response from target server %s, statusCode: %d', path, proxyResponse.statusCode);
            }
            var statusCode = proxyResponse.statusCode;
            if (error && statusCode === 400 || statusCode === 500) {
                console.error('  < HTTP response from target server %s, statusCode: %d', path, proxyResponse.statusCode);
            } else if (debugging) {
                console.log('  < HTTP response from target server %s, statusCode: %d', path, proxyResponse.statusCode);
            }

            // Write header and status out first
            socket.write(new Buffer(JSON.stringify({
                statusCode: proxyResponse.statusCode,
                headers: proxyResponse.headers
            })).toString('base64')+"}");

            proxyResponse.on(
                'data',
                function (chunk) {
                    if (debugging) {
                        console.log('  < HTTP response from target server %s, length=%d', path, chunk.length);
                    }
                    socket.write(chunk);
                }
            );

            proxyResponse.on(
                'end',
                function () {
                    if (debugging) {
                        console.log('  < HTTP response from target server %s, END', path);
                    }
                    socket.end();
                }
            );
        }
    );
}

/**
 * On client socket error
 * - Target connection should end
 * @param socket
 * @param remoteAddress
 * @param targetSocket
 */
function onClientSocketError(socket, remoteAddress, targetSocket) {
    socket.on('error', function (error) {
        console.error("[Client Socket] FROM %s TO %j, error: %j", remoteAddress, socket.target, error);
        if (targetSocket) {
            targetSocket.end();
        }
    });
}

/**
 * On client socket end
 * - Target connection should end
 * @param socket
 * @param remoteAddress
 * @param targetSocket
 */
function onClientSocketEnd(socket, remoteAddress, targetSocket) {
    socket.on('end', function () {
        console.info("[Client Socket] closed, FROM %s", remoteAddress);
        if (targetSocket) {
            targetSocket.end();
        }
    });
}

/**
 * After TCP connection accessed this server
 * @param socket
 */
function connectionHandler(socket){
    var remoteAddress = socket.remoteAddress;
    console.log('[Proxy TCP Server] Get a new connection [%s]', remoteAddress);

    var handledHeadInfo = false; // Indicate if the head info has been handled
    var targetSocket = null;
    var index = -1;
    var buf = new Buffer(''); // Buffer for client input for output to target HTTP/HTTPs server
    var isHttpEnded = false; // Is the client HTTP request ended.
    var bufferInput = ''; // If the key value doesn't identified by the value, we need to wait for the value.

    var startIdentifier = "}";

    socket.on('data', function(chunk){
        var chunkString = chunk.toString();
        console.info("[Client Socket] [%s], data: length=%s", remoteAddress, chunkString.length);
        if( !handledHeadInfo ) {
            // Only when we identified key words we will consider the header part is identified.
            var ourDataIndex = chunkString.indexOf("}");
            if(ourDataIndex>-1) {
                // Change status
                handledHeadInfo = true;

                var jsonString = bufferInput + chunkString.substring(0, ourDataIndex);

                // Use base64 to decode the header part of the request.
                var header = new Buffer(jsonString, 'base64').toString();

                try {
                    //console.info("[Client Socket], will parse %j", header);
                    var obj = JSON.parse(header);
                    //console.info("[Client Socket], will handle %j", obj);
                    socket.target = obj;

                    var leftDataToTargetServer = '';

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

                        // Connect to target Https server and get things
                        targetSocket = requestHttpsTarget(socket, obj.host, obj.port, obj.httpVersion);

                        leftDataToTargetServer = chunkString.substring(ourDataIndex+1);
                        targetSocket.write(leftDataToTargetServer);
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
                        targetSocket = requestHttpTarget(socket, path, options);

                        // Request to target server error, back the error to caller
                        targetSocket.on(
                            'error',
                            function ( error ) {
                                if ( error ) {
                                    console.error( '  < HTTP request for target server %s, ERROR=', path, error );
                                }
                                socket.end();
                            }
                        );

                        leftDataToTargetServer = chunkString.substring(ourDataIndex+1);

                        // Find the end for HTTP as the extra string
                        if( (index = leftDataToTargetServer.indexOf("!!!END!!!")) !== -1 ) {
                            leftDataToTargetServer = leftDataToTargetServer.substring(0, index);
                        }

                        // Write some of the body data
                        if(leftDataToTargetServer.length>0) {
                            targetSocket.write(leftDataToTargetServer);
                        }

                        // Should ed it immediately
                        if(index !== -1 ) {
                            targetSocket.end();
                        }
                    }

                    // If there are some data in buffer
                    // - When connection to target is not established, but the data arrived case
                    if(buf.length>0) {
                        targetSocket.write(buf);
                        buf = new Buffer(0);
                    }

                    // Http is ended find
                    // - When connection to target is not established, but the data arrived to say the game ended
                    if(isHttpEnded) {
                        targetSocket.end();
                    }
                } catch(e) {
                    console.trace(e);
                }
            } else {
                // There is the content from client, but there is no } within the input, which means the input may be longer, and the algorithm doesn't work.
                console.error("[Client Socket] [%s], Can't find '}': %s", remoteAddress, chunkString);
                bufferInput += chunkString;
            }
        } else {
            if( (index = chunkString.indexOf("!!!END!!!")) !== -1) {
                chunk = new Buffer(chunkString.substring(0, index));

                // Close the targetSocket after write all, HTTP Case
                if(targetSocket) {
                    targetSocket.end();
                } else {
                    isHttpEnded = true;
                }
            }

            if(targetSocket) {
                if(chunk.length>0) {
                    console.info("[Client Socket], On more data, to Target server: length=%d", chunk.length);
                    targetSocket.write(chunk);
                }
            } else {
                buf = Buffer.concat([buf, chunk]);
            }
        }
    });

    onClientSocketError(socket, remoteAddress, targetSocket);
    onClientSocketEnd(socket, remoteAddress, targetSocket);
}

/**
 * Start TCP server
 * @param port
 */
var simpleServer = require('../net/simpleServer');
function startTcpServer(port){
    simpleServer.listen(port, connectionHandler);
}

exports.start = startTcpServer;