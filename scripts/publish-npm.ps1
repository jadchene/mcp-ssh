[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PublishRegistry = "https://registry.npmjs.org/",
    # 保留旧参数兼容脚本调用；新流程不修改全局 registry，无需恢复。
    [string]$RestoreRegistry = "",
    [string]$Access = "public",
    [string]$Otp = ""
)

$ErrorActionPreference = "Stop"
$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$packageJsonPath = Join-Path $resolvedProjectRoot "package.json"
if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    throw "package.json not found under project root: $resolvedProjectRoot"
}

if (-not $PSCmdlet.ShouldProcess($resolvedProjectRoot, "Publish package to $PublishRegistry")) {
    return
}

Push-Location $resolvedProjectRoot
try {
    # registry 仅作用于本次命令，不改变用户配置或凭据文件属性。
    & npm whoami --registry $PublishRegistry *> $null
    if ($LASTEXITCODE -ne 0) {
        & npm login --registry $PublishRegistry
        if ($LASTEXITCODE -ne 0) { throw "npm login failed with exit code $LASTEXITCODE." }
    }

    $publishArguments = @("publish", "--access", $Access, "--registry", $PublishRegistry)
    if ($Otp) { $publishArguments += "--otp=$Otp" }
    & npm @publishArguments
    if ($LASTEXITCODE -ne 0) { throw "npm publish failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}

Write-Host "Published package to $PublishRegistry."
