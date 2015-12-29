/**
 * Created by Hunter on 12/21/2015.
 */

"use strict";
var url=require('url');

/**
 * Get port from host string
 * - Only Https call this function
 * - http://user:pass@host.com:8080/p/a/t/h?query=string#hash
 * - refer to https://nodejs.org/docs/latest/api/url.html#url_url
 * @param hostString
 * @param defaultPort
 * @returns {*[]}
 */
function getHostAndPort(hostString, defaultPort) {
    var options = url.parse("https://"+hostString);
    return [options.hostname, options.port||defaultPort];
}

exports.getHostAndPort = getHostAndPort;