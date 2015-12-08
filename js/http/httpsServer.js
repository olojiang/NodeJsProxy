/**
 * Created by Hunter on 4/27/2015.
 */
"use strict";
var https = require('https');
var fs = require('fs');

var options = {
    key: fs.readFileSync('d:/certs/key.pem'),
    cert: fs.readFileSync('d:/certs/cert.pem')
};

https.createServer(options, function (req, res) {
    console.info("req.url:", req.url);
    res.writeHead(200);
    res.end("hello world\n");
}).listen(8000);