Register-ArgumentCompleter -Native -CommandName kv -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commands = 'init', 'apply', 'run', 'scan', 'diff', 'set', 'get', 'list', 'use', 'rm', 'alias', 'config', 'vault', 'share', 'import', 'lock', 'passwd', 'help'

    $tokens = $commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { $_.ToString() }

    # Drop the value following a flag that takes one, and find the group flag's value.
    $cmd = $null
    $group = $null
    $i = 0
    while ($i -lt $tokens.Count) {
        $tok = $tokens[$i]
        if ($tok -eq '-g' -or $tok -eq '--group') {
            $group = $tokens[$i + 1]
            $i += 2
            continue
        }
        if ($tok -eq '-e' -or $tok -eq '--env' -or $tok -eq '--from') {
            $i += 2
            continue
        }
        if ($tok -like '-*') {
            $i += 1
            continue
        }
        if (-not $cmd) { $cmd = $tok }
        $i += 1
    }

    function Get-KvCandidates([string]$what) {
        $args = @('__complete', $what)
        if ($group) { $args += @('--group', $group) }
        try { & kv @args 2>$null } catch { @() }
    }

    $candidates = switch ($cmd) {
        $null { $commands }
        'apply' { @('all') + (Get-KvCandidates 'names') }
        { $_ -in 'get', 'rm', 'set', 'alias' } { Get-KvCandidates 'names' }
        { $_ -in 'share', 'import', 'use' } { Get-KvCandidates 'groups' }
        default { @() }
    }

    $candidates |
        Where-Object { $_ -like "$wordToComplete*" } |
        ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
