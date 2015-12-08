##HTTP && HTTPs Proxy Written in Node.js
There are 2 types of usage from this project:


#### Usage Pre-request
1. Has node.js installed.<br>
2. Define 3 Environment Variables:<br>
* `NP_LOCAL_PORT`, default 27777<br>
* `NP_REMOTE_HOST`, no default, it will be your remote server IP address<br>
* `NP_REMOTE_PORT`, default 37777<br>

#### Usage
##### On remote server machine, start server first.<br>
        cd /path_to/nodejsproxy/test/<br>
        node testProxyServer.js<br>
##### On local machine, start the client.<br>
        /path_to/nodejsproxy/test/
        node testProxyClient.js<br>
##### Point any other application, like browser, etc to use local proxy client.<br>

#### Test
I test the proxy by deploying the proxy server under centOS 6.x(Out of china)<br>
And deploy the proxy client under windows 7, window 8.x, it works fine to access Youtube, Facebook, Twitter from China.<br>