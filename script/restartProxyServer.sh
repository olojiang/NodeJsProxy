#!/usr/bin/env bash
cd /opt/nodejsproxy/test/
tail -n 10 ../testProxyServer.log


echo ''
echo 'Before Kill'
pgrep -fl '^node testProxyServer.js'

kill $(pgrep -f '^node testProxyServer.js')

echo ''
echo 'After Kill'
pgrep -fl '^node testProxyServer.js'

echo ''
echo 'Start'
cd /opt/nodejsproxy/test/
#nohup node --debug testProxyServer.js 2>../testProxyServer.err 1>../testProxyServer.log &
nohup node testProxyServer.js >../testProxyServer.log 2>&1 &

sleep .5
echo ''
echo 'After Start'
pgrep -fl '^node testProxyServer.js'
