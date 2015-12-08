chdir /d %~dp0
cd ../test
set path=D:\devtools\nodejs;%PATH%
echo %NP_REMOTE_HOST%
node testProxyClient.js

pause