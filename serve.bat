@echo off
REM Launches a local web server on http://localhost:8000 so the spike can fetch input files.
REM openscad-wasm cannot be loaded from file:// — it needs to be served over http(s).
cd /d "%~dp0"
echo Starting local server at http://localhost:8000
echo Open that URL in Chrome or Edge.  Ctrl+C to stop.
python -m http.server 8000
