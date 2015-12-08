/**
 * Created by Hunter on 3/12/2015.
 */
"use strict";
var http = require('http');

function httpSimple(port) {
    http.createServer(function(req, res){
        res.writeHead(200, {'ContentType': 'text/html'});
        res.end('Hello Olojiang.');
    }).listen(port);

    console.log("Http Server on port: "+port+" is running.");
}
exports.httpSimple = httpSimple;

function httpEchoServer(port) {
    http.createServer(function(req, res){

        console.info("req.method:", req.method);
        console.info("req.headers:", req.headers);

        var body = [];

        res.writeHead(200, {'Content-Type': 'text/plain'});

        req.on('data', function(chunk){
            body.push(chunk);
            res.write(chunk);
        });

        req.on('end', function(chunk){
            res.end();

            body = Buffer.concat(body);
            console.info("body:", body.toString());
        });

    }).listen(port);

    console.log("Http Server on port: "+port+" is running.");
}
exports.httpEchoServer = httpEchoServer;