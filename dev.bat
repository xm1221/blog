@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\" (
    call npm install
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1221.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

start "" http://localhost:1221/blog
node server.js
pause
