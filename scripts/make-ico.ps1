Add-Type -AssemblyName System.Drawing

$inputPath = Join-Path $PSScriptRoot "..\assets\logo.jpg"
$pngPath = Join-Path $PSScriptRoot "..\assets\logo.png"
$icoPath = Join-Path $PSScriptRoot "..\assets\icon.ico"

$img = [System.Drawing.Image]::FromFile($inputPath)

# Generate 256x256 PNG
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, 0, 0, 256, 256)

$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR structure
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type 1 = ICO
$bw.Write([uint16]1) # 1 image

# ICONDIRENTRY structure
$bw.Write([byte]0)   # 256 width is represented as 0
$bw.Write([byte]0)   # 256 height is represented as 0
$bw.Write([byte]0)   # Palette count
$bw.Write([byte]0)   # Reserved
$bw.Write([uint16]1) # Color planes
$bw.Write([uint16]32)# Bits per pixel
$bw.Write([uint32]$pngBytes.Length) # Image data length
$bw.Write([uint32]22) # Offset (6 byte header + 16 byte entry)

# Raw PNG data
$bw.Write($pngBytes)

$bw.Close()
$fs.Close()
$ms.Dispose()
$g.Dispose()
$bmp.Dispose()
$img.Dispose()

Write-Host "Created assets/icon.ico and assets/logo.png successfully!"
