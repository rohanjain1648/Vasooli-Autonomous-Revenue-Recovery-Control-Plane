<#
.SYNOPSIS
    Renders the Hinglish IVR recovery script to a .wav file using Windows'
    built-in offline SAPI speech engine - no network call, no live
    telephony dependency (design spec section 13, explicitly out of scope).

.DESCRIPTION
    Reads demo/audio/hinglish-ivr-script.txt (produced by
    apps/engine/scripts/render-ivr-script.ts, which uses the same
    LlmProvider.generateContent() template-substitution path the
    executor uses in production) and synthesizes it to
    demo/audio/hinglish-ivr-recovery.wav.

    Windows ships only English SAPI voices by default (Microsoft David /
    Zira Desktop) - there is no offline Hindi voice available without an
    extra language pack install, so this renders the romanized Hinglish
    text through an English voice. It is intelligible but accented; the
    pitch should note this is a template-and-render pipeline demo, not a
    claim of production-quality Hindi TTS.

.EXAMPLE
    pnpm demo:voice
    # or directly:
    powershell -ExecutionPolicy Bypass -File scripts/render-ivr-audio.ps1
#>

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "demo\audio\hinglish-ivr-script.txt"
$outPath = Join-Path $repoRoot "demo\audio\hinglish-ivr-recovery.wav"

if (-not (Test-Path $scriptPath)) {
    Write-Error "Script text not found at $scriptPath - run the render-ivr-script.ts step first (see package.json's demo:voice)."
}

$text = Get-Content -Path $scriptPath -Raw

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
try {
    $synth.SelectVoice("Microsoft Zira Desktop")
} catch {
    Write-Warning "Zira voice unavailable, using default installed voice."
}
$synth.SetOutputToWaveFile($outPath)
$synth.Speak($text)
$synth.Dispose()

Write-Host "Rendered IVR audio -> $outPath"
