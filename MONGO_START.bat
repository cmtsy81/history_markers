@echo off
start cmd /k "nodemon server.js"
timeout /t 3 /nobreak >nul
start chrome http://localhost:3000/map.html
start chrome http://localhost:3000/admin_locations.html
code .
exit
