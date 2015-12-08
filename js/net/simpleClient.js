/**
 * Created by Hunter on 3/29/2015.
 */
"use strict";
var net = require('net');

var responseData = [];
function conn(host, port, content) {
    var clientSocket = net.connect({
        host: host,
        port: port
    }, function(){
        console.info("* Connected to Server, %s:%d", host, port);
        if(content){
            console.info("* Writing Content: \n%s", content);
            clientSocket.write(content);
        }
    });

    // Set client encoding
    clientSocket.setEncoding('utf8');

    clientSocket.on('data', function(data){
        responseData.push(data.toString());
    });

    clientSocket.on('error', function(err){
        console.log(responseData.join('\n'));
        console.error("* Client error: ", err.message, err);
    });

    clientSocket.on('end', function(){
        console.log("* From server: \n", responseData.join('\n'));
    });

    clientSocket.on('close', function(){
        console.log("* Connection closed: ", host+":"+port);
        clientSocket.end();
    });

    clientSocket.setTimeout(60000, function(){
        console.error("60 Seconds timeout elapsed");
        clientSocket.end();
    });
}

exports.conn = conn;