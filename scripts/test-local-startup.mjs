import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exec = promisify(execFile);
const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";
const helper = psQuote(join(root, "scripts/lib/local-startup.ps1"));

async function powershell(code) {
  const encoded = Buffer.from(
    "$ErrorActionPreference = 'Stop'; . " + helper + "; " + code,
    "utf16le",
  ).toString("base64");
  return exec(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      cwd: root,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
}

async function removeFixture(directory) {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.match(basename(directory), /^diplomachain-(build|health|launch)-/);
  await rm(directory, { recursive: true, force: true });
}

async function withServer(handler, action) {
  const server = createServer(handler);
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return await action("http://127.0.0.1:" + server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const wait = (url, seconds = 8, extra = "") =>
  powershell(
    "Wait-HttpReady -Url " +
      psQuote(url) +
      " -Process ([Diagnostics.Process]::GetCurrentProcess()) -TimeoutSeconds " +
      seconds +
      " " +
      extra,
  );

test("PowerShell scripts parse on Windows PowerShell 5.1", async () => {
  for (const name of [
    "start.ps1",
    "run.ps1",
    "scripts/start-fabric-local.ps1",
    "scripts/lib/local-startup.ps1",
  ]) {
    await powershell(
      "$tokens = $null; $parseErrors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile(" +
        psQuote(join(root, name)) +
        ", [ref]$tokens, [ref]$parseErrors); if ($parseErrors.Count) { throw ($parseErrors | Out-String) }",
    );
  }
});

test("build cache detects edits, added/deleted inputs, missing output and corrupt cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "diplomachain-build-"));
  try {
    await powershell(
      [
        "function Assert-Value($actual, $expected, $message) { if ($actual -ne $expected) { throw $message } }",
        "$dir = " + psQuote(directory),
        "$src = Join-Path $dir 'src'",
        "[void](New-Item -ItemType Directory -Path $src)",
        "$source = Join-Path $src 'main.ts'",
        "$spec = Join-Path $src 'main.spec.ts'",
        "$added = Join-Path $src 'extra.ts'",
        "$artifact = Join-Path $dir 'main.js'",
        "$cache = Join-Path $dir 'cache/build.json'",
        "Set-Content -LiteralPath $source -Value 'source'",
        "(Get-Item -LiteralPath $source).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(-5)",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Missing output must build'",
        "Set-Content -LiteralPath $artifact -Value 'compiled'",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $false 'Newer output can be reused before cache exists'",
        "(Get-Item -LiteralPath $source).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(1)",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Newer source must build without cache'",
        "(Get-Item -LiteralPath $source).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(-5)",
        "Save-LocalBuildStamp $artifact @($src) $cache",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $false 'Unchanged inputs must be reused'",
        "Set-Content -LiteralPath $spec -Value 'test-only'",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $false 'Tests must not trigger production build'",
        "Set-Content -LiteralPath $added -Value 'added-source'",
        "(Get-Item -LiteralPath $added).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(-10)",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Backdated added source must build'",
        "Save-LocalBuildStamp $artifact @($src) $cache",
        "Remove-Item -LiteralPath $added",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Deleted source must build'",
        "Save-LocalBuildStamp $artifact @($src) $cache",
        "Set-Content -LiteralPath $source -Value 'modified-source'",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Modified source must build'",
        "Save-LocalBuildStamp $artifact @($src) $cache",
        "(Get-Item -LiteralPath $artifact).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(1)",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Replaced output must invalidate cache'",
        "Set-Content -LiteralPath $cache -Value 'not-json'",
        "Assert-Value (Test-LocalBuildRequired $artifact @($src) $cache) $true 'Invalid cache must rebuild'",
      ].join("; "),
    );
  } finally {
    await removeFixture(directory);
  }
});

test("HTTP 200 is ready", async () => {
  await withServer(
    (req, res) => res.end("ready"),
    (url) => wait(url),
  );
});

test("large login HTML is accepted when Web returns HTTP 200", async () => {
  await withServer(
    (req, res) => res.end("<html>" + "x".repeat(128 * 1024) + "</html>"),
    (url) => wait(url),
  );
});

test("HTTP 503 is retried until healthy", async () => {
  let requests = 0;
  await withServer(
    (req, res) => {
      requests++;
      res.statusCode = requests < 3 ? 503 : 200;
      res.end(requests < 3 ? "fabric not ready" : "ready");
    },
    (url) => wait(url),
  );
  assert.equal(requests, 3);
});

test("slow valid health response is accepted, not cut off after 3 seconds", async () => {
  await withServer(
    (req, res) => {
      const timer = setTimeout(() => res.end("ready"), 3500);
      res.on("close", () => clearTimeout(timer));
    },
    (url) => wait(url),
  );
});

test("health timeout includes HTTP error and useful log tail", async () => {
  const directory = await mkdtemp(join(tmpdir(), "diplomachain-health-"));
  const log = join(directory, "api.err.log");
  try {
    await writeFile(log, "\u001b[31mAPI_TEST_FAILURE\u001b[0m\n");
    await withServer(
      (req, res) => {
        res.statusCode = 503;
        res.end('{"fabric":"down"}');
      },
      async (url) => {
        await powershell(
          "$failed = $false; try { Wait-HttpReady -Url " +
            psQuote(url) +
            " -Process ([Diagnostics.Process]::GetCurrentProcess()) -TimeoutSeconds 2 -LogPaths @(" +
            psQuote(log) +
            ") } catch { $failed = $true; $detail = $_.Exception.Message; if ($detail -notmatch 'HTTP 503' -or $detail -notmatch 'fabric' -or $detail -notmatch 'API_TEST_FAILURE' -or $detail.Contains([char]27)) { throw $detail } }; if (-not $failed) { throw 'Unhealthy service was incorrectly accepted' }",
        );
      },
    );
  } finally {
    await removeFixture(directory);
  }
});

test("exited child is reported immediately with exit code", async () => {
  await powershell(
    [
      "$child = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-Command', 'exit 23') -WindowStyle Hidden -PassThru",
      "$child.WaitForExit()",
      "$failed = $false",
      "$timer = [Diagnostics.Stopwatch]::StartNew()",
      "try { Wait-HttpReady -Url 'http://127.0.0.1:1' -Process $child -TimeoutSeconds 10 } catch { $failed = $true; if ($_.Exception.Message -notmatch 'exit 23') { throw } }",
      "if (-not $failed -or $timer.Elapsed.TotalSeconds -gt 2) { throw 'Exited process not detected immediately' }",
    ].join("; "),
  );
});

test("connection failure remains unready", async () => {
  await powershell(
    "$probe = Invoke-LocalHealthProbe -Url 'http://127.0.0.1:1' -TimeoutSeconds 1; if ($probe.Ready -or -not $probe.Detail) { throw 'Connection failure must be reported' }",
  );
});

test("hanging health request respects per-request deadline", async () => {
  await withServer(
    () => {},
    (url) =>
      powershell(
        "$timer = [Diagnostics.Stopwatch]::StartNew(); $probe = Invoke-LocalHealthProbe -Url " +
          psQuote(url) +
          " -TimeoutSeconds 1; if ($probe.Ready -or $timer.Elapsed.TotalSeconds -gt 3) { throw 'Health request exceeded deadline' }",
      ),
  );
});

test("normal startup does not reset storage or silently disable Fabric/PKI", async () => {
  const script = await readFile(join(root, "start.ps1"), "utf8");
  assert.match(script, /if \(\$Setup -or \$CheckOnly\) \{/);
  assert.match(script, /scripts\/check-local-setup\.mjs/);
  assert.match(script, /\$apiArguments = @\('dist\/main\.js'\)/);
  assert.match(
    script,
    /\$webMode = if \(\$Dev\) \{ 'dev' \} else \{ 'start' \}/,
  );
  assert.match(script, /start-fabric-local\.ps1/);
  assert.match(script, /setup-pdf-pki\.mjs/);
  assert.doesNotMatch(
    script,
    /migrate reset|down\s+-v|FABRIC_ENABLED\s*=\s*false/,
  );
});

async function launchFixture(options = "") {
  const directory = await mkdtemp(join(tmpdir(), "diplomachain-launch-"));
  try {
    await mkdir(join(directory, "scripts/lib"), { recursive: true });
    await copyFile(join(root, "start.ps1"), join(directory, "start.ps1"));
    const helperText = await readFile(
      join(root, "scripts/lib/local-startup.ps1"),
      "utf8",
    );
    await writeFile(
      join(directory, "scripts/lib/local-startup.ps1"),
      helperText +
        '\nfunction Wait-HttpReady { param($Url, $Process, $TimeoutSeconds, $LogPaths); $global:startupCalls.Add("health=$Url") }\n',
    );
    for (const file of [
      ".env.infrastructure",
      "apps/api/.env",
      "apps/api/.env.database",
      "apps/api/prisma/schema.prisma",
      "apps/api/src/generated/prisma/client.ts",
      "package.json",
      "package-lock.json",
      "apps/web/src/page.tsx",
      "apps/api/dist/main.js",
      "apps/web/.next/BUILD_ID",
    ]) {
      const path = join(directory, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "fixture");
      const date = new Date(
        Date.now() -
          (file.endsWith("main.js") || file.endsWith("BUILD_ID")
            ? 60_000
            : 600_000),
      );
      await utimes(path, date, date);
    }
    const { stdout } = await powershell(
      [
        "$global:startupCalls = New-Object System.Collections.Generic.List[string]",
        'function docker { $global:startupCalls.Add("docker=$args"); $global:LASTEXITCODE = 0 }',
        "function node.exe {}",
        "function npm.cmd {}",
        'function node { if ($args[0] -eq "-p") { "C:\mock\cli.js" } else { $global:startupCalls.Add("node=$args") }; $global:LASTEXITCODE = 0 }',
        'function npm { $global:startupCalls.Add("npm=$args"); $global:LASTEXITCODE = 0 }',
        "function Get-NetTCPConnection {}",
        "function Start-Process { param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, $RedirectStandardOutput, $RedirectStandardError, [switch]$PassThru); $global:startupCalls.Add(\"start=$WorkingDirectory|$($ArgumentList -join ' ')\"); [Diagnostics.Process]::GetCurrentProcess() }",
        'function taskkill.exe { $global:startupCalls.Add("stop=$args") }',
        'function Read-Host { "" }',
        "& " + psQuote(join(directory, "start.ps1")) + " " + options,
        'Write-Output ("TEST_CALLS=" + (ConvertTo-Json -InputObject @($global:startupCalls.ToArray()) -Compress))',
      ].join("; "),
    );
    const line = stdout
      .split(/\r?\n/)
      .find((value) => value.startsWith("TEST_CALLS="));
    assert.ok(line, stdout);
    return JSON.parse(line.slice("TEST_CALLS=".length));
  } finally {
    await removeFixture(directory);
  }
}

test("default launcher reuses current builds and skips database preparation", async () => {
  const calls = await launchFixture();
  assert.ok(calls.includes("node=scripts/check-local-setup.mjs"));
  assert.ok(
    calls.every((call) => !call.startsWith("npm=")),
    calls.join("\n"),
  );
  assert.ok(
    calls.some((call) => /start=.*apps\\api\|dist\/main\.js/.test(call)),
  );
  assert.ok(
    calls.some((call) => /start=.*apps\\web\|.* start --port 3000$/.test(call)),
  );
  assert.equal(calls.filter((call) => call.startsWith("health=")).length, 2);
  assert.equal(calls.filter((call) => call.startsWith("stop=")).length, 2);
});

test("Setup prepares database explicitly", async () => {
  const calls = await launchFixture("-Setup");
  assert.deepEqual(
    calls.filter((call) => call.startsWith("npm=")),
    [
      "npm=run db:generate -w api",
      "npm=run db:migrate -w api",
      "npm=run db:seed -w api",
    ],
  );
  assert.ok(!calls.includes("node=scripts/check-local-setup.mjs"));
});

test("Dev explicitly restores watch mode without production builds", async () => {
  const calls = await launchFixture("-Dev");
  assert.ok(calls.some((call) => /start=.* start --watch$/.test(call)));
  assert.ok(calls.some((call) => /start=.* dev --port 3000$/.test(call)));
  assert.ok(calls.every((call) => !call.startsWith("npm=")));
});

test("Rebuild rebuilds applications without running seed or Prisma generate", async () => {
  const calls = await launchFixture("-Rebuild");
  // PowerShell consumes the -- separator when npm is a function mock.
  assert.deepEqual(
    calls.filter((call) => call.startsWith("npm=")),
    ["npm=exec -w api nest build", "npm=run build -w @diploma-chain/web"],
  );
});
