@echo off
title Dragon Realms D&D Server
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b)
start "" http://localhost:8080
node server.js
pause
