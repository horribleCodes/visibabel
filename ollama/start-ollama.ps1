$ErrorActionPreference = 'Stop'

if (-not $env:OLLAMA_HOST) {
	$env:OLLAMA_HOST = '0.0.0.0:11434'
}
if (-not $env:OLLAMA_ORIGINS) {
	$env:OLLAMA_ORIGINS = '*'
}

Write-Host "[visibabel] Starting Ollama"
Write-Host "[visibabel] OLLAMA_HOST=$($env:OLLAMA_HOST)"
Write-Host "[visibabel] OLLAMA_ORIGINS=$($env:OLLAMA_ORIGINS)"

& ollama serve
