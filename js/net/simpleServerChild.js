/**
 * Created by Hunter on 5/6/2015.
 */
"use strict";

process.on('message', function(message, server){
    if(message === "server") {
        console.info("* Server connection listener length: %d, %j", server.listeners("connection").length, server.listeners("connection"));
        server.on('connection', function(socket){
            socket.end("* Handled by simpleServerChild.js");
        });

        console.info("* Server connection listener length: %d", server.listeners("connection").length);
    }
});