@echo off
setlocal EnableExtensions EnableDelayedExpansion

where npm >NUL 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js e npm nao foram encontrados no PATH.
    echo Instale em https://nodejs.org/ e reabra o terminal antes de continuar.
    exit /b 1
)

echo == Instalando dependencias (npm install) ==
call npm install
if errorlevel 1 (
    echo [ERRO] npm install falhou. Verifique a conexao com a internet e tente novamente.
    exit /b 1
)

echo == Gerando executavel portatil (npm run package:win) ==
call npm run package:win
if errorlevel 1 (
    echo [ERRO] A construcao do executavel falhou. Verifique as mensagens acima.
    exit /b 1
)

echo == Concluido ==
echo O executavel portatil esta na pasta dist\
for %%F in ("dist\BlackCounter_Portable_*.exe") do set "LAST_BUILD=%%~fF"
if defined LAST_BUILD (
    echo Ultimo build: !LAST_BUILD!
)
start "" explorer "%cd%\dist"
exit /b 0
