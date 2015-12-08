/**
 * Created by Hunter on 4/27/2015.
 */
"use strict";

require('../js/process/uncaughtException').init(process);

var proxyServer = require('../js/http/proxyServer');
proxyServer.start(process.env.NP_REMOTE_PORT||37777);