This document describes the steps needed to build SDK.

1. Required software installation:
	- Python 3.

2. SDK build:
	- python build.py

   Useful flags:
	- --develop                     generate browser-debugging scripts.js
	- --desktop                     include desktop-specific files
	- --mobile                      include mobile-specific files
	- --product word                build only one product (repeatable)
	- --addon ../sdkjs-addon-name   merge addon configs (repeatable)

## Deploy SDKJS to the Windows desktop development build

The PDF editor does **not** load its plugin API from `pdf/src/engine/viewer.js`
alone. `configs/word.json` puts `pdf/api_plugins.js` in
`word/sdk-all-min.js` and `pdf/src/viewer.js` in `word/sdk-all.js`. The
desktop PDF editor executes a **V8 snapshot**, `pdf/sdk-all.bin`, generated
from those two word bundles (plus PDF native scripts). Updating just the
JavaScript files without regenerating the snapshot leaves the editor running
old code. The standalone `pdf/src/engine/viewer.js` is a separate Closure
build; keep it current too, but it is not a replacement for `word/sdk-all.js`.

From the `DesktopEditors` repository root, with Python, Java, and the SDKJS
build dependencies installed, run these PowerShell commands. The `O:` path is
the development output of `build_tools/build-onlyoffice-x64.bat`; replace
`$app` if your **running** `editors.exe` uses another location.

```powershell
$root = (Get-Location).Path
$app = 'O:\build_tools\out\win_64\onlyoffice\DesktopEditors'

# Build the separate PDF/Closure artifact, then the desktop SDK bundles.
# make.py must run from sdkjs/pdf/build (its paths are relative to cwd).
Push-Location "$root\sdkjs\pdf\build"
try { python make.py; if ($LASTEXITCODE -ne 0) { throw 'PDF build failed' } }
finally { Pop-Location }
Push-Location "$root\sdkjs\build"
try { python build.py --desktop; if ($LASTEXITCODE -ne 0) { throw 'SDKJS build failed' } }
finally { Pop-Location }

$src = "$root\sdkjs\deploy\sdkjs"
$dst = "$app\editors\sdkjs"
foreach ($file in @('word\sdk-all-min.js', 'word\sdk-all.js',
                    'pdf\src\engine\viewer.js')) {
    Copy-Item -LiteralPath "$src\$file" -Destination "$dst\$file" -Force
    if ((Get-FileHash "$src\$file").Hash -ne (Get-FileHash "$dst\$file").Hash) {
        throw "Deployed SDKJS file differs: $file"
    }
}

# x2t reads converter/DoctRenderer.config relative to its working directory
# and refreshes editors/sdkjs/pdf/sdk-all.bin (as well as other snapshots).
Push-Location "$app\converter"
try { .\x2t.exe -create-js-snapshots; if ($LASTEXITCODE -ne 0) { throw 'Snapshot build failed' } }
finally { Pop-Location }
Get-Item "$dst\pdf\sdk-all.bin" | Select-Object FullName, Length, LastWriteTime
```

If also testing `plugins-src/khmer-ocr`, deploy it into **both** the packaged
plugin directory and the Typsastra user profile (the app can load either). Do
not copy `.git` or the untracked `benchmarks` directory:

```powershell
$plugin = "$root\plugins-src\khmer-ocr"
$guid = '{0E5BEC1D-C728-46E1-9876-2BFD7E980F40}'
$targets = @(
    "$app\editors\sdkjs-plugins\$guid",
    "$env:LOCALAPPDATA\Typsastra\TypsastraOffice\data\sdkjs-plugins\$guid"
)
foreach ($target in $targets) {
    robocopy $plugin $target /E /XD .git benchmarks /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Plugin deployment failed: $target" }
    if ((Get-FileHash "$plugin\code.js").Hash -ne (Get-FileHash "$target\code.js").Hash) {
        throw "Deployed plugin differs: $target"
    }
}
```

Close and restart the **same** development `editors.exe` before checking a new
snapshot or plugin version; preserve unsaved documents first. Use
`Get-CimInstance Win32_Process -Filter "name='editors.exe'" |
Select-Object ProcessId, ExecutablePath` to check the running path. In the
Khmer OCR panel, click a recognized line and check
the status: `Highlight request accepted for page N.` means the API returned
`true`; `Text highlight API result: false.` means the PDF viewer rejected the
request. If a newly copied plugin still shows old behavior, verify its
`config.json` entry URL and `index.html` script URL are cache-busted and check
both plugin directories. Do not use the separately installed `C:\Program
Files\Typsastra\DesktopEditors` when testing the `O:` development build.
