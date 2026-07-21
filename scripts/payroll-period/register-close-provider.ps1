# ===================================================================
# NOMINA360
# Sprint : 3.1.1
# Script : register-close-provider.ps1
# Objetivo: Registrar ClosePayrollPeriodUseCase en PayrollModule
# ===================================================================

$ErrorActionPreference = "Stop"

$modulePath = ".\src\payroll\payroll.module.ts"

$content = Get-Content $modulePath -Raw

$import = "import { ClosePayrollPeriodUseCase } from './use-cases/close-payroll-period.use-case';"

if ($content -notmatch [regex]::Escape($import)) {

    $anchor = "import { CreatePayrollPeriodUseCase } from './use-cases/create-payroll-period.use-case';"

    if ($content.Contains($anchor)) {

        $content = $content.Replace(
            $anchor,
            "$anchor`r`n$import"
        )

    } else {

        throw "No se encontró el punto de inserción del import."

    }
}

if ($content -notmatch '\bClosePayrollPeriodUseCase\b') {

    $content = $content.Replace(
        "PayrollCalculatorService,",
        "PayrollCalculatorService,`r`n    ClosePayrollPeriodUseCase,"
    )
}

Set-Content `
    -Path $modulePath `
    -Value $content `
    -Encoding UTF8

Write-Host ""
Write-Host "Provider registrado correctamente." -ForegroundColor Green