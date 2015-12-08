/**
 * Created by Hunter on 3/28/2015.
 */
"use strict";
var http = require('http');

function post(host, port, path, content, method, callback) {
    var options = {
        hostname: host,
        port: port,
        path: path,
        method: method||'post',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    var request = http.request(options, function(response){

        if(callback) {
            callback(response, request);
        } else {
            var body = [];

            console.info("response.statusCode:", response.statusCode);
            console.info("response.headers:", response.headers);

            response.on('data', function(chunk){
                body.push(chunk);
            });

            response.on('end', function(){
                body = Buffer.concat(body);
                console.info("body:", body.toString());
            });
        }
    });

    request.write(content);
    request.end();
}

exports.post = post;