param([string]$OutputDirectory = '.delivery-work\audio')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root $OutputDirectory
New-Item -ItemType Directory -Path $output -Force | Out-Null
$segments = Get-Content -LiteralPath (Join-Path $root 'docs\demo\narration.json') -Raw | ConvertFrom-Json
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Zira Desktop')
$speaker.Rate = 0
$speaker.Volume = 100
try {
  for ($i = 0; $i -lt $segments.Count; $i++) {
    $file = Join-Path $output ('voice-{0:d2}.wav' -f $i)
    $speaker.SetOutputToWaveFile($file)
    $speaker.Speak($segments[$i].text)
    $speaker.SetOutputToNull()
    Write-Output (Split-Path $file -Leaf)
  }
} finally { $speaker.Dispose() }
