[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ExampleConfigPath = "",
    [switch]$KeepTarball
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$Description
    )

    $argumentText = if ($Arguments.Count -gt 0) { $Arguments -join " " } else { "" }
    $target = if ($argumentText) { "$FilePath $argumentText" } else { $FilePath }  

    if ($PSCmdlet.ShouldProcess($target, $Description)) {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $target"
        }
    }
}

function Invoke-CaptureStep {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Description
    )

    $argumentText = if ($Arguments.Count -gt 0) { $Arguments -join " " } else { "" }
    $target = if ($argumentText) { "$FilePath $argumentText" } else { $FilePath }  

    if ($PSCmdlet.ShouldProcess($target, $Description)) {
        $output = & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $target"
        }

        return $output
    }

    return @()
}

$resolvedProjectRoot = (Resolve-Path $ProjectRoot).Path
$packageJsonPath = Join-Path $resolvedProjectRoot "package.json"
$defaultConfigPath = Join-Path $resolvedProjectRoot "config.example.json"
$resolvedConfigPath = if ($ExampleConfigPath) { $ExampleConfigPath } else { $defaultConfigPath }
$packageName = "mcp-ssh-service"

if (-not (Test-Path $packageJsonPath)) {
    throw "package.json not found under project root: $resolvedProjectRoot"        
}

$packageInfo = Get-Content -Raw $packageJsonPath | ConvertFrom-Json

Push-Location $resolvedProjectRoot
try {
    Invoke-Step -FilePath "npm" -Arguments @("install") -WorkingDirectory $resolvedProjectRoot -Description "Install project dependencies"
    Invoke-Step -FilePath "npm" -Arguments @("run", "build") -WorkingDirectory $resolvedProjectRoot -Description "Build the MCP SSH service"
    $packOutput = Invoke-CaptureStep -FilePath "npm" -Arguments @("pack", "--json") -Description "Create a package tarball for global installation"
    if ($packOutput.Count -gt 0) {
        $packInfo = ($packOutput -join "`n" | ConvertFrom-Json)[0]
        $tarballPath = Join-Path $resolvedProjectRoot $packInfo.filename
    } else {
        $tarballPath = Join-Path $resolvedProjectRoot "$($packageInfo.name)-$($packageInfo.version).tgz"
    }

    try {
        Invoke-Step -FilePath "npm" -Arguments @("uninstall", "-g", $packageName) -WorkingDirectory $resolvedProjectRoot -Description "Remove any previous global installation of mcp-ssh-service"
    }
    catch {
        Write-Host "Previous global installation was not removed cleanly. Continuing with fresh install."
    }

    Invoke-Step -FilePath "npm" -Arguments @("install", "-g", $tarballPath) -WorkingDirectory $resolvedProjectRoot -Description "Install the packaged mcp-ssh-service tarball globally"

    if (-not $KeepTarball -and (Test-Path $tarballPath)) {
        Remove-Item $tarballPath -Force
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Global installation completed."
Write-Host "Command: mcp-ssh-service"
Write-Host "Example start command:"
Write-Host "  mcp-ssh-service --config $resolvedConfigPath"
Write-Host ""
Write-Host "Example MCP server configuration:"

$example = @{
    mcpServers = @{
        ssh = @{
            command = "mcp-ssh-service"
            args = @(
                "--config",
                $resolvedConfigPath
            )
        }
    }
} | ConvertTo-Json -Depth 6

Write-Host $example
