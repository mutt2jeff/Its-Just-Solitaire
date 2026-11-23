# Draws the original app icon (two cards on felt) and writes PNGs to /icons.
# Run: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'icons'
New-Item -ItemType Directory -Force $out | Out-Null

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Get-Pt([float]$x, [float]$y, [float]$ox, [float]$oy, [float]$s) {
  return New-Object Drawing.PointF(($ox + $x * $s), ($oy + $y * $s))
}

# Heart shape from the game's suit symbol (0..100 box)
function New-Heart([float]$ox, [float]$oy, [float]$s) {
  $p = New-Object Drawing.Drawing2D.GraphicsPath
  $segs = @(
    @(50,90, 22,70, 4,52, 4,32), @(4,32, 4,17, 16,6, 30,6), @(30,6, 39,6, 46,11, 50,19),
    @(50,19, 54,11, 61,6, 70,6), @(70,6, 84,6, 96,17, 96,32), @(96,32, 96,52, 78,70, 50,90))
  foreach ($c in $segs) {
    $p.AddBezier((Get-Pt $c[0] $c[1] $ox $oy $s), (Get-Pt $c[2] $c[3] $ox $oy $s),
                 (Get-Pt $c[4] $c[5] $ox $oy $s), (Get-Pt $c[6] $c[7] $ox $oy $s))
  }
  $p.CloseFigure()
  return $p
}

$S = 512
$bmp = New-Object Drawing.Bitmap $S, $S
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.InterpolationMode = 'HighQualityBicubic'

# Felt background (full bleed so it works as a maskable icon)
$bg = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.Point 0, 0), (New-Object Drawing.Point 0, $S),
  [Drawing.Color]::FromArgb(255, 0x23, 0x7a, 0x6d), [Drawing.Color]::FromArgb(255, 0x0a, 0x3a, 0x36))
$g.FillRectangle($bg, 0, 0, $S, $S)

$cw = 196; $ch = 274
$gold = [Drawing.Color]::FromArgb(255, 0xe3, 0xb4, 0x56)
$shadow = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(70, 0, 0, 0))

# Back card (tilted left)
$st = $g.Save()
$g.TranslateTransform(222, 266); $g.RotateTransform(-13)
$g.FillPath($shadow, (New-RoundRect (-$cw/2 + 6) (-$ch/2 + 10) $cw $ch 20))
$g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 0xf3, 0xea, 0xd8))), (New-RoundRect (-$cw/2) (-$ch/2) $cw $ch 20))
$g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 0x7a, 0x2e, 0x3a))), (New-RoundRect (-$cw/2 + 12) (-$ch/2 + 12) ($cw - 24) ($ch - 24) 12))
$g.DrawPath((New-Object Drawing.Pen $gold, 4), (New-RoundRect (-$cw/2 + 22) (-$ch/2 + 22) ($cw - 44) ($ch - 44) 8))
$star = New-Object Drawing.Drawing2D.GraphicsPath
$star.AddPolygon([Drawing.PointF[]]@(
  (New-Object Drawing.PointF 0, -40), (New-Object Drawing.PointF 10, -10), (New-Object Drawing.PointF 40, 0), (New-Object Drawing.PointF 10, 10),
  (New-Object Drawing.PointF 0, 40), (New-Object Drawing.PointF -10, 10), (New-Object Drawing.PointF -40, 0), (New-Object Drawing.PointF -10, -10)))
$g.FillPath((New-Object Drawing.SolidBrush $gold), $star)
$g.Restore($st)

# Front card (tilted right): Ace of hearts in the game's style
$st = $g.Save()
$g.TranslateTransform(292, 262); $g.RotateTransform(9)
$g.FillPath($shadow, (New-RoundRect (-$cw/2 + 6) (-$ch/2 + 10) $cw $ch 20))
$g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 0xfb, 0xf7, 0xee))), (New-RoundRect (-$cw/2) (-$ch/2) $cw $ch 20))
$red = [Drawing.Color]::FromArgb(255, 0xbf, 0x2f, 0x3a)
$g.DrawEllipse((New-Object Drawing.Pen ([Drawing.Color]::FromArgb(255, 0xc9, 0x95, 0x2e)), 3), -66, -44, 132, 132)
$g.FillPath((New-Object Drawing.SolidBrush $red), (New-Heart -46 -24 0.92))
$font = New-Object Drawing.Font('Georgia', 50, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$g.DrawString('A', $font, (New-Object Drawing.SolidBrush $red), (-$cw/2 + 12), (-$ch/2 + 8))
$g.FillPath((New-Object Drawing.SolidBrush $red), (New-Heart ($cw/2 - 52) (-$ch/2 + 16) 0.38))
$g.Restore($st)
$g.Dispose()

function Save-Size([int]$n, [string]$name) {
  $b = New-Object Drawing.Bitmap $n, $n
  $gg = [Drawing.Graphics]::FromImage($b)
  $gg.InterpolationMode = 'HighQualityBicubic'
  $gg.SmoothingMode = 'AntiAlias'
  $gg.DrawImage($bmp, 0, 0, $n, $n)
  $gg.Dispose()
  $b.Save((Join-Path $out $name), [Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}
$bmp.Save((Join-Path $out 'icon-512.png'), [Drawing.Imaging.ImageFormat]::Png)
Save-Size 192 'icon-192.png'
Save-Size 180 'apple-touch-icon.png'
Save-Size 32 'favicon-32.png'
$bmp.Dispose()
Write-Host "Icons written to $out"
