##HTTP && HTTPs Proxy Written in Node.js
There are 2 types of usage from this project.

#### Usage Pre-request
Define 3 Environment Variable:<br>
* NP_LOCAL_PORT, default 27777<br>
* NP_REMOTE_HOST, no default<br>
* NP_REMOTE_PORT, default 37777<br>

#### Usage
On remote server machine, start server first.<br>
On local machine, start the client.<br>
Point any other application, like browser, etc to use local proxy client.<br>

#### Test
I test the proxy by deploy the proxy server under centOS 6.x(Out of china)<br>
And deploy the proxy client under windows 7, window 8.x, it works fine to access Youtube, Facebook, Twitter from China.<br>