#!/usr/bin/env bash
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
nohup node testProxyServer.js 2>../testProxyServer.err 1>../testProxyServer.log &

sleep .5
echo ''
echo 'After Start'
pgrep -fl '^node testProxyServer.js'
