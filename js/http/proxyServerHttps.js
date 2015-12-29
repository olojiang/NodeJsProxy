/**
 * Created by Hunter on 12/22/2015.
 */
"use strict";

var net = require('net');

var errorLevel = true;
var info = true;
var debugging = false;
var detail = false;

var connNum = 0;
var dataSize = {};

function claimMemory(seqNum) {
    delete dataSize[seqNum];
}

function closeConnection(seqNum, path, socketRequest, proxySocket, error) {

    proxySocket.isEnded = true;
    if(error) {
        proxySocket.isError = true;
    }

    if(dataSize[seqNum]!==undefined) {
        connNum--;

        if(!socketRequest.isClosed) {
            if(error) {
                socketRequest.write( "500 Connection error\r\n" );
            }

            socketRequest.end();
        }
    }

    var log = error?console.error:console.log;

    if (info) {
        log('    < [%d] [HTTPs] '+(error?"[ERROR]":"[END]")+', %s, [Output Size], %d, [CONN]: %d' + (error?", Error:":""), seqNum, path, dataSize[seqNum], connNum, (error?error:""));
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
 * @returns {exports.Socket}
 */
function requestHttpsTarget(seqNum, socketRequest, url, port, httpVersion){
    dataSize[seqNum] = 0;

    // Set up TCP connection to target server
    var proxySocket = new net.Socket();

    connNum++;

    if(info) {
        console.info("    = [%d] [HTTPs] [Request]: %s/%s, [CONN] %d", seqNum, url, port, connNum);
    }

    proxySocket.connect(
        parseInt( port ), url,
        function () {
            if ( info ) {
                console.log( '    - [%d] [HTTPs] [Connected] %s/%s', seqNum, url, port );
            }
        }
    );

    var path = url+":"+port;

    // Pass target server's response back to caller
    proxySocket.on(
        'data',
        function ( chunk ) {
            if ( debugging ) {
                console.log( '    < [%d] [HTTPs] [Data], length=%d, %s', seqNum, chunk.length, path );
            }

            dataSize[seqNum] += chunk.length;

            // Return the data back to caller, only when it's not closed
            if(!socketRequest.isClosed) {
                socketRequest.write( chunk );
            } else {
                proxySocket.close();
            }
        }
    );

    // Reading from target server error
    proxySocket.on(
        'error',
        function ( err ) {
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

    return proxySocket;
}

exports.requestHttpsTarget = requestHttpsTarget;