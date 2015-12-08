/**
 * Created by Hunter on 5/6/2015.
 */
"use strict";

var http=require('http');
var https=require('https');
var url=require('url');
var net = require('net');
var fs = require('fs');

var error = true;
var debugging = true;
var detail = false;

var proxyServerUrl = null;
var proxyServerPort = null;

function getReqNumFunc() {
    var reqNum = 0;
    return function(){
        return ++reqNum;
    };
}

var getReqNum = getReqNumFunc();

/**
 * Http Handling and Delegating function
 * - It will not handle, if it's other request, like HTTPS.
 * @param userRequest
 * @param userResponse
 */
function httpHandler( userRequest, userResponse ) {
    var reqNum = getReqNum();
    if ( error ) {
        console.log( '- [%d]HTTP request url: %s', reqNum, userRequest.url );
    }

    var headers = userRequest.headers;
    var httpVersion = userRequest.httpVersion;
    var httpHost = headers.host;
    var httpPort = 80;
    var httpRequestEnd = false;
    var tcpConnectionEstablished = false;

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

    var buf = '';

    if ( detail ) {
        console.log( '  > [%d]HTTP request to target server %s options: %s', reqNum, path, JSON.stringify( options, null, 2 ) );
    }

    // Set up TCP connection to target server
    var proxySocket = new net.Socket();
    proxySocket.noDataYet = true;
    proxySocket.connect(
        parseInt( proxyServerPort ),
        proxyServerUrl,
        function () {
            if ( debugging ) {
                console.log( '   - [%d]TCP Connected to %s:%s', reqNum, proxyServerUrl, proxyServerPort );
            }

            // Tell the caller the connection was successfully established
            //userResponse.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

            // Tell proxy server the HTTP request Header, and path (HTTP)
            proxySocket.write( new Buffer(JSON.stringify({
                options: options,
                path: path,
                type: "http",
                reqNum: reqNum
            })).toString('base64') + "}");

            tcpConnectionEstablished = true;
            if( httpRequestEnd ) {
                proxySocket.write( "!!!END!!!" );
            }
        }
    );

    /*
     * Proxy Section
     */
    // Pass target server's response back to caller
    proxySocket.on(
        'data',
        function ( chunk ) {
            if ( debugging ) {
                console.log( '    < [%d]TCP From Target, length=%d, %j', reqNum, chunk.length, path );
            }

            if( proxySocket.noDataYet ) {
                var chunkString = chunk.toString();
                var index = chunkString.indexOf("}");

                var headerString = null;

                if(index !== -1) {
                    proxySocket.noDataYet = false;
                    var headerChunkString = chunkString.substring(0, index);
                    //console.info("Before parse: index=%d, %s", index, buf + headerChunkString);
                    headerString = new Buffer(buf + headerChunkString, 'base64').toString();
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
                            //console.log( '    < [%d]TCP write chunk(Starter), length=%d, %j', reqNum, chunk.length, path );
                            userResponse.write(chunk);
                        }
                    } catch(e) {
                        console.error("JSON.parse(%j), Error, %j", headerString, e);
                    }
                } else {
                    console.warn("* Proxy Server format warn, can't find '}', Warning: %j", chunkString);
                    buf += chunkString;
                }
            } else {
                // Return the data back to caller
                //console.log( '    < [%d]TCP write chunk(Content), length=%d, %j', reqNum, chunk.length, path );
                userResponse.write( chunk );
            }
        }
    );

    // Reading from target server error
    proxySocket.on(
        'error',
        function ( err ) {
            userResponse.writeHead( 500 );
            userResponse.write( "HTTPs/" + httpVersion + " 500 Connection error\r\n\r\n" );
            if ( error ) {
                console.error( '    < [%d] TCP From Target, ERR: %j, %j, ', reqNum, err, path );
            }

            //userResponse.write(
            //    "<h1>500 Error</h1>\r\n" +
            //    "<p>Error was <pre>" + error + "</pre></p>\r\n" +
            //    "</body></html>\r\n"
            //);
            userResponse.end();
        }
    );

    // End of passing target server's response back to caller
    proxySocket.on(
        'end',
        function () {
            if ( debugging ) {
                console.log( '    < [%d] TCP From Target, END, %j', reqNum, path );
            }
            userResponse.end();
        }
    );

    // Setup TCP timeout
    setupTcpTimeout(proxySocket);

    /*
     * Caller Section
     */
    userRequest.addListener(
        'data',
        function (chunk) {
            if ( debugging ) {
                console.info( '  < [%d] HTTP request %s, from caller, length=%d', reqNum, path, chunk.length );
            }
            proxySocket.write( chunk );
        }
    );

    userRequest.addListener(
        'error',
        function (error) {
            if ( debugging ) {
                console.info( '  < [%d] HTTP request %s, from caller, ERROR, %j', reqNum, path, error );
            }
            proxySocket.end();
        }
    );

    userRequest.addListener(
        'end',
        function () {
            if ( debugging ) {
                console.info( '  < [%d] HTTP request %s, from caller, END', reqNum, path );
            }

            httpRequestEnd = true;
            if( tcpConnectionEstablished ) {
                proxySocket.write( "!!!END!!!" );
            }
        }
    );

    /*
     * Browser side closed the connection
     */
    userResponse.on('close', function(){
        console.info( '  < [%d] HTTP request %s, from caller, CLOSE', reqNum, path );
        httpRequestEnd = true;
        proxySocket.end();
    });
}

/**
 * Https Handling and Delegating Function
 * @param request
 * @param socketRequest
 * @param bodyHead
 */
function httpsHandler( request, socketRequest, bodyHead ) {
    var url = request.url;
    var httpVersion = request.httpVersion;

    var hostInfo = getHostAndPort( url, 443/*default port*/ ); // [host, port]
    var targetHost = hostInfo[0];
    var targetPort = hostInfo[1];

    if ( error ) {
        console.log( ' = Will connect to %s:%s', proxyServerUrl, proxyServerPort );
    }

    // Set up TCP connection to target server
    var proxySocket = new net.Socket();
    proxySocket.connect(
        parseInt( proxyServerPort ),
        proxyServerUrl,
        function () {
            if ( debugging ) {
                console.log( '  - HTTPs Connected to %s/%s', proxyServerUrl, proxyServerPort );
            }

            // Tell the caller the connection was successfully established
            socketRequest.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

            // Tell proxy server the targetHost and targetPort, and version (HTTPs)
            proxySocket.write( new Buffer(JSON.stringify({
                host: targetHost,
                port: targetPort,
                httpVersion: httpVersion,
                type: "https"
            })).toString('base64') + "}");

            // Pass the bodyHead from caller to target server.
            if(bodyHead.length!==0) {
                if ( debugging ) {
                    console.log('    > HTTPs bodyHead from Caller, length=%d, %s', bodyHead.length, url);
                }
                proxySocket.write( bodyHead );
            }
        }
    );

    /*
     * Proxy Section
     */
    // Pass target server's response back to caller
    proxySocket.on(
        'data',
        function ( chunk ) {
            if ( debugging ) {
                console.log( '    < HTTPs From Target, length=%d, %s', chunk.length, url );
            }

            // Return the data back to caller
            socketRequest.write( chunk );
        }
    );

    // Reading from target server error
    proxySocket.on(
        'error',
        function ( err ) {
            socketRequest.write( "HTTPs/" + httpVersion + " 500 Connection error\r\n\r\n" );
            if ( error ) {
                console.error( '    < HTTPs From Target, ERR: %s, %s, ', err, url );
            }
            socketRequest.end();
        }
    );

    // End of passing target server's response back to caller
    proxySocket.on(
        'end',
        function () {
            if ( debugging ) {
                console.log( '    < HTTPs From Target, END, %s', url );
            }

            socketRequest.end();
        }
    );

    // Set TCP timeout
    setupTcpTimeout(proxySocket);

    /*
     * Requester section
     */
    // Pass caller request to target server
    socketRequest.on(
        'data',
        function ( chunk ) {
            if ( debugging ) {
                console.log( '    > HTTPs From Caller, %s, length=%d', url, chunk.length );
            }

            proxySocket.write( chunk );
        }
    );

    // Reading from caller error, and close the connection to target server
    socketRequest.on(
        'error',
        function ( err ) {
            if ( error ) {
                console.error( '  > HTTPs From Caller, %s, ERR: %s', url, err );
            }
            proxySocket.end();
        }
    );

    // End of passing caller request to target server
    socketRequest.on(
        'end',
        function () {
            if ( debugging ) {
                console.log( '    < HTTPs From Caller, %s, END', url );
            }

            proxySocket.end();
        }
    );
}

/**
 * Get port from host string
 * - Only Https call this function
 * - http://user:pass@host.com:8080/p/a/t/h?query=string#hash
 * - refer to https://nodejs.org/docs/latest/api/url.html#url_url
 * @param hostString
 * @param defaultPort
 * @returns {*[]}
 */
function getHostAndPort(hostString, defaultPort) {
    var options = url.parse("https://"+hostString);
    return [options.hostname, options.port||defaultPort];
}

function setupTcpTimeout(proxySocket) {
// Time out, when the connection is not active and do any communication
    var timeout = 600 * 1000;
    proxySocket.setTimeout(timeout); // 10 minute
    proxySocket.on('timeout', function () {
        proxySocket.write('idle timeout, disconnecting, bye!');
        proxySocket.end();
    });
}

/**
 * Entry point for the client server
 * @param port
 * @param remoteUrl
 * @param remotePort
 */
function start(port, remoteUrl, remotePort) {
    proxyServerUrl = remoteUrl;
    proxyServerPort = remotePort;

    // Create an http server to capture browser input
    var server = http.createServer(httpHandler).listen(port);

    // On connection to handle HTTPs
    server.on('connect', httpsHandler); // HTTPS connect listener

    console.info("Http&Https proxy listening on port: " + port);
}

exports.start = start;