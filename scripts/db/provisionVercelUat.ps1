<#
Provision the synthetic MongoDB database used by Vercel Preview deployments.

The script pulls the current Production variables into an OS temporary file,
derives a database named bridges_physiotherapy_uat, seeds it, and then writes
only Preview overrides back to Vercel. Secret values are never printed.
#>

$ErrorActionPreference = 'Stop'
$temporaryEnvFile = [System.IO.Path]::GetTempFileName()

function Get-EnvFileValue {
  param(
    [string]$Path,
    [string]$Name
  )

  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -like "$Name=*" } |
    Select-Object -First 1

  if (-not $line) {
    throw "$Name was not returned by Vercel."
  }

  $value = $line.Substring($Name.Length + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function New-RandomSecret {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Set-VercelPreviewSecret {
  param(
    [string]$Name,
    [string]$Value
  )

  & vercel env add $Name preview '' --force --sensitive --yes --value $Value
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to set Vercel Preview variable $Name."
  }
}

try {
  Remove-Item -LiteralPath $temporaryEnvFile -Force
  & vercel env pull $temporaryEnvFile --environment=production --yes
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to pull Vercel Production variables.'
  }

  $productionUri = Get-EnvFileValue -Path $temporaryEnvFile -Name 'MONGODB_URI'
  $schemeEnd = $productionUri.IndexOf('://')
  $pathStart = $productionUri.IndexOf('/', $schemeEnd + 3)
  if ($schemeEnd -lt 0 -or $pathStart -lt 0) {
    throw 'Production MONGODB_URI has no database path.'
  }

  $queryStart = $productionUri.IndexOf('?', $pathStart)
  if ($queryStart -lt 0) {
    $uatUri = $productionUri.Substring(0, $pathStart) + '/bridges_physiotherapy_uat'
  } else {
    $uatUri = $productionUri.Substring(0, $pathStart) + '/bridges_physiotherapy_uat' + $productionUri.Substring($queryStart)
  }

  $uatDataEncryptionKey = New-RandomSecret
  $uatAccessTokenSecret = New-RandomSecret
  $uatRefreshTokenSecret = New-RandomSecret
  $uatSeedPassword = "UAT-$((New-RandomSecret).Substring(0, 16))"

  $env:MONGODB_URI = $uatUri
  $env:DATA_ENCRYPTION_KEY = $uatDataEncryptionKey
  $env:ACCESS_TOKEN_SECRET = $uatAccessTokenSecret
  $env:REFRESH_TOKEN_SECRET = $uatRefreshTokenSecret
  $env:UAT_SEED_PASSWORD = $uatSeedPassword
  $env:NODE_ENV = 'production'

  & npm run db:seed:uat
  if ($LASTEXITCODE -ne 0) {
    throw 'The UAT seed failed; Vercel Preview variables were not changed.'
  }

  Set-VercelPreviewSecret -Name 'MONGODB_URI' -Value $uatUri
  Set-VercelPreviewSecret -Name 'DATA_ENCRYPTION_KEY' -Value $uatDataEncryptionKey
  Set-VercelPreviewSecret -Name 'ACCESS_TOKEN_SECRET' -Value $uatAccessTokenSecret
  Set-VercelPreviewSecret -Name 'REFRESH_TOKEN_SECRET' -Value $uatRefreshTokenSecret
  Set-VercelPreviewSecret -Name 'RESEND_API_KEY' -Value ''

  Write-Output 'Preview database and preview-only auth/encryption overrides configured.'
  Write-Output "UAT test password: $uatSeedPassword"
}
finally {
  Remove-Item -LiteralPath $temporaryEnvFile -Force -ErrorAction SilentlyContinue
}
