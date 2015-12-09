##HTTP && HTTPs Proxy Written in Node.js
There are 2 types of usage from this project:<br>

1. Start http&&https proxy on remote server, and use local browser to use it directly (This method has some issue with GWF, so is not recommended)<br>
2. Start remote server, start local server, use browser or other application to connect to local server (Recommend).<br>

#### Usage Pre-request

1. Has node.js installed.<br>
2. Define 3 Environment Variables:
  * `NP_LOCAL_PORT`, default 27777
  * `NP_REMOTE_HOST`, no default, it will be your remote server IP address
  * `NP_REMOTE_PORT`, default 37777

#### Usage
##### On remote server machine, start server first.
        cd /path_to/nodejsproxy/test/
        node testProxyServer.js
##### On local machine, start the client.
        cd /path_to/nodejsproxy/test/
        node testProxyClient.js
##### Point any other application, like browser(Chrome: [SwitchyOmega](https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif?hl=en)), etc to use local proxy client.

#### Test
I test the proxy by deploying the proxy server under centOS 6.x(Out of china)<br>
And deploy the proxy client under windows 7, window 8.x, it works fine to access Youtube, Facebook, Twitter from China.<br>