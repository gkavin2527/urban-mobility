$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoPath '.env'
Write-Host 'Configure the local MySQL connection. Your password is saved only in the ignored .env file.'
$mysqlHostValue = Read-Host 'Host [127.0.0.1]'
if (-not $mysqlHostValue) { $mysqlHostValue = '127.0.0.1' }
$mysqlHostValue = $mysqlHostValue.Trim()
if ($mysqlHostValue -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$') { throw 'Enter a host name or IPv4 address such as 127.0.0.1.' }
$mysqlPortValue = Read-Host 'Port [3306]'
if (-not $mysqlPortValue) { $mysqlPortValue = '3306' }
if ($mysqlPortValue -notmatch '^\d{1,5}$' -or [int]$mysqlPortValue -lt 1 -or [int]$mysqlPortValue -gt 65535) { throw 'Enter a MySQL port from 1 through 65535.' }
$mysqlUserValue = Read-Host 'MySQL user [root]'
if (-not $mysqlUserValue) { $mysqlUserValue = 'root' }
$defaultDatasetPath = Join-Path $repoPath 'data/raw/bangalore_traffic_timely_data.csv'
$datasetPathValue = Read-Host "Dataset CSV path [$defaultDatasetPath]"
if (-not $datasetPathValue) { $datasetPathValue = $defaultDatasetPath }
$datasetPathValue = $datasetPathValue.Trim()
$mysqlPasswordValue = Read-Host 'MySQL password (hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPasswordValue)
try {
    $passwordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    foreach ($value in @($mysqlHostValue, $mysqlPortValue, $mysqlUserValue, $datasetPathValue, $passwordText)) {
        if ($value -match '[\r\n]') { throw 'Connection values cannot contain newlines.' }
    }
    $contents = @(
        ('MYSQL_HOST=' + (ConvertTo-Json -InputObject $mysqlHostValue -Compress)),
        ('MYSQL_PORT=' + $mysqlPortValue),
        ('MYSQL_USER=' + (ConvertTo-Json -InputObject $mysqlUserValue -Compress)),
        ('MYSQL_PASSWORD=' + (ConvertTo-Json -InputObject $passwordText -Compress)),
        'MYSQL_DATABASE=urban_mobility',
        'LOG_LEVEL=debug',
        ('DATASET_CSV=' + (ConvertTo-Json -InputObject $datasetPathValue -Compress))
    ) -join "`n"
    [IO.File]::WriteAllText($envPath, $contents + "`n", [Text.UTF8Encoding]::new($false))
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $passwordText = $null
}
Write-Host 'Saved local configuration. Do not commit .env or share its contents.'
