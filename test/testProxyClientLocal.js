/**
 * Created by Hunter on 4/27/2015.
 */
var proxyClient = require('../js/http/proxyClient');
proxyClient.start(process.env.NP_LOCAL_PORT||27777, "127.0.0.1", process.env.NP_REMOTE_PORT||37777);