chdir /d %~dp0
cd ../test
set path=D:\devtools\nodejs;%PATH%
node testProxyClient.js

pause