@echo off
:: test.cmd  Windows cmd.exe / PowerShell entry point for the test harness.
:: Finds Git Bash and runs scripts/test.sh through it. All arguments pass
:: through unchanged so `scripts\test --lint` is equivalent to running
:: `./scripts/test.sh --lint` in bash directly.

setlocal

:: Prefer bash on PATH; falls back to common Git for Windows install paths.
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 goto :run_bash

if exist "%ProgramFiles%\Git\bin\bash.exe" (
    set "BASH=%ProgramFiles%\Git\bin\bash.exe"
    goto :run_full
)

if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" (
    set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
    goto :run_full
)

if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" (
    set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
    goto :run_full
)

echo ERROR: bash not found. Install Git for Windows from https://git-scm.com/ 1>&2
echo or add a bash binary to your PATH. 1>&2
exit /b 1

:run_bash
bash "%~dp0test.sh" %*
exit /b %ERRORLEVEL%

:run_full
"%BASH%" "%~dp0test.sh" %*
exit /b %ERRORLEVEL%
