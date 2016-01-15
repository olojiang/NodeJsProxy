## HTTP && HTTPs Proxy Written in Node.js
There are 2 types of usage from this project:

1. Start http&&https proxy on remote server, and use local browser to use it directly (This method has some issue with GWF, so is not recommended)
2. Start remote server, start local server, use browser or other application to connect to local server (Recommend).

#### Usage Pre-request

1. Has node.js installed (With npm).
2. Install extra node_modules, run under root folder(Both Client and Server):
  * `npm install`
3. Define 3 Environment Variables:
  * `NP_LOCAL_PORT`, default `27777`
  * `NP_REMOTE_HOST`, no default, it will be your remote server IP address
  * `NP_REMOTE_PORT`, default `37777`

#### Usage
##### On remote server machine, start server first.
        cd /path_to/nodejsproxy/test/
        node testProxyServer.js
##### On local machine, start the client.
        cd /path_to/nodejsproxy/test/
        node testProxyClient.js
##### Point any other application, like browser(Chrome: [SwitchyOmega](https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif?hl=en)), etc to use local proxy client.

#### Test
I tested the proxy by deploying the proxy server under centOS 6.x(Out of China)<br/>
I tested the proxy by deploying the proxy server under centOS 7.x(Out of China)

I deployed the proxy client under windows 7, window 8.x, it works fine to access Google, Google Mail, Google Image, Youtube, Facebook, Twitter, etc from China.

#### Client | Server internal status
All server status are in **JSON** format, so we can use other tool to gather the status to make it more beautiful.

* To debug any of the errors of client or server, we need to know what's the status of client, server internal. So we need one tool to view the process of proxy dynamically
* Following is the internal interface for you, if you want to debug, check, test about them.

##### Format:

* `Client Status`: http://localhost:%NP_LOCAL_PORT%/proxy_client_status
* `Client Error Message Reset`: http://localhost:%NP_LOCAL_PORT%/proxy_client_status
* `Server Status`: http://%NP_REMOTE_HOST%:%NP_REMOTE_PORT+1%/proxy_client_status
* `Server Error Message Reset`: http://%NP_REMOTE_HOST%:%NP_REMOTE_PORT+1%/proxy_client_status

##### Example:

* `Client Status`: http://localhost:27777/proxy_client_status
* `Client Error Message Reset`: http://localhost:27777/proxy_client_clear_error
* `Server Status`: http://www.yourdomain.com:37778/
* `Server Error Message Reset`: http://www.yourdomain.com:37778/clear_error