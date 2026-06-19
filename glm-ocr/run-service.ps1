$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$venvPython = Join-Path $ScriptDir '.venv\Scripts\python.exe'
$venvPip = Join-Path $ScriptDir '.venv\Scripts\pip.exe'

if (-not (Test-Path $venvPython)) {
	python -m venv .venv
}

& $venvPip install -r requirements.txt -q
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 5002
