@echo off
cd /d "%~dp0"
set "SPC_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%SPC_NODE%" set "SPC_NODE=node"
"%SPC_NODE%" "node_modules\vinext\dist\cli.js" dev --host 127.0.0.1 --port 3000
pause
