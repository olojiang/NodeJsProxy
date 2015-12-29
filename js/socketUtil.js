/**
 * Created by Hunter on 12/21/2015.
 */
"use strict";

/**
 * Time out, when the connection is not active and do any communication
 * @param proxySocket
 */
function setupTcpTimeout(proxySocket) {
    var timeout = 600 * 1000;
    proxySocket.setTimeout(timeout); // 10 minute
    proxySocket.on('timeout', function () {
        proxySocket.write('idle timeout, disconnecting, bye!');
        proxySocket.end();
    });
}

exports.setupTcpTimeout = setupTcpTimeout;