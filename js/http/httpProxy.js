/**
 * Created by Hunter on 4/27/2015.
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

/**
 * Http Handling and Delegating function
 * - It will not handle, if it's other request, like HTTPS.
 * @param userRequest
 * @param userResponse
 */
function httpHandler( userRequest, userResponse ) {
    if ( error ) {
        console.log( '- Http request url: %s', userRequest.url );
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

    if ( detail ) {
        console.log( '  > HTTP request to target server %s options: %s', path, JSON.stringify( options, null, 2 ) );
    }

    // Send request to target server
    var proxyRequest = http.request(
        options,
        function ( proxyResponse ) {
            if ( detail ) {
                console.log( '  < HTTP response from target server %s, statusCode: %d, headers: %s', path, proxyResponse.statusCode, JSON.stringify( proxyResponse.headers, null, 2 ) );
            }
            var statusCode = proxyResponse.statusCode;
            if(error && statusCode===400||statusCode===500) {
                console.error( '  < HTTP response from target server %s, statusCode: %d', path, proxyResponse.statusCode);
            } else if(debugging){
                console.log( '  < HTTP response from target server %s, statusCode: %d', path, proxyResponse.statusCode);
            }

            userResponse.writeHead(
                proxyResponse.statusCode,
                proxyResponse.headers
            );

            proxyResponse.on(
                'data',
                function (chunk) {
                    if ( debugging ) {
                        console.log( '  < HTTP response from target server %s, length=%d', path, chunk.length );
                    }
                    userResponse.write( chunk );
                }
            );

            proxyResponse.on(
                'end',
                function () {
                    if ( debugging ) {
                        console.log( '  < HTTP response from target server %s, END', path );
                    }
                    userResponse.end();
                }
            );
        }
    );

    // Request to target server error, back the error to caller
    proxyRequest.on(
        'error',
        function ( error ) {
            if ( error ) {
                console.error( '  < HTTP request for target server %s, ERROR=', path, error );
            }
            userResponse.writeHead( 500 );
            userResponse.write(
                "<h1>500 Error</h1>\r\n" +
                "<p>Error was <pre>" + error + "</pre></p>\r\n" +
                "</body></html>\r\n"
            );
            userResponse.end();
        }
    );

    userRequest.addListener(
        'data',
        function (chunk) {
            if ( debugging ) {
                console.info( '  < HTTP request %s, from caller, length=%d', path, chunk.length );
            }
            proxyRequest.write( chunk );
        }
    );

    userRequest.addListener(
        'end',
        function () {
            if ( debugging ) {
                console.info( '  < HTTP request %s, from caller, END', path );
            }
            proxyRequest.end();
        }
    );
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
        console.log( ' = Will connect to %s:%s', targetHost, targetPort );
    }

    // Set up TCP connection to target server
    var proxySocket = new net.Socket();
    proxySocket.connect(
        parseInt( targetPort ), targetHost,
        function () {
            if ( debugging ) {
                console.log( '  - HTTPs Connected to %s/%s', targetHost, targetPort );
            }

            // Tell the caller the connection was successfully established
            socketRequest.write( "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n" );

            // Pass the bodyHead from caller to target server.
            if(bodyHead.length!==0) {
                if ( debugging ) {
                    console.log('    > HTTPs bodyHead from Caller, length=%d, %s', bodyHead.length, url);
                }
                proxySocket.write( bodyHead );
            }
        }
    );

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

    // Reading from target server error
    proxySocket.on(
        'error',
        function ( err ) {
            socketRequest.write( "HTTP/" + httpVersion + " 500 Connection error\r\n\r\n" );
            if ( error ) {
                console.error( '    < HTTPs From Target, ERR: %s, %s, ', err, url );
            }
            socketRequest.end();
        }
    );

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

exports.start = function(port) {
    // Create an http server to capture browser input
    var server = http.createServer(httpHandler).listen(port);

    // On connection to handle HTTPs
    server.on('connect',httpsHandler); // HTTPS connect listener

    console.info("Http&Https proxy listening on port: " + port);
};