/**
 * Created by Hunter on 3/29/2015.
 */
"use strict";
var net = require('net');
var cp = require('child_process');

// Multiple TCP process support DEMO.
//var child = cp.fork('js/net/simpleServerChild');

function defaultConnectionHandler(socket){
    console.log('* Get a new connection from %s - %s:%d', socket.remoteFamily, socket.remoteAddress, socket.remotePort);

    socket.on('data', function(chunk){
        console.info("* Client Socket data: \n%s", chunk.toString());
        socket.write("* Echo from server: \n" + chunk);
        socket.end("  -------------------  ");
    });
    socket.on('error', function(error){
        console.error("* Client Socket error: %j", error);
        socket.end();
    });
    socket.on('end', function(){
        console.info("* Client Socket closed.");
        socket.end();
    });
}

function listen(port, connectionHandler) {
    var server = net.createServer();

    server.on('connection', connectionHandler||defaultConnectionHandler);
    console.info("* Server connection listener length: %d", server.listeners("connection").length);

    server.on('error', function(error){
        console.error("* Server error: %j", error);

        // When server has error, close it
        server.close();

        if(error.code === "EADDRINUSE") {
            console.error("* Port is already in use, %j", server.address());
        }
    });

    server.on('close', function(){
        console.info('* Server closed');
    });

    server.on('listening', function(){
        console.info("* Server is listening on: %j", server.address());

        // Let the child process to monitor server.on('connection', handler); too
        //child.send("server", server);
    });

    // Listen on port
    server.listen(port);

    // After unref() is called, If server process, is the only item awake in event loop, the server process will end.
    //server.unref();
}

exports.listen = listen;