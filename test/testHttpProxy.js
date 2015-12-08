/**
 * Created by Hunter on 4/27/2015.
 */
var httpProxy = require('../js/http/httpProxy');
httpProxy.start(process.env.NP_LOCAL_PORT||27777);