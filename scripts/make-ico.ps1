Add-Type -AssemblyName System.Drawing

$inputPath = Join-Path $PSScriptRoot "..\assets\logo.jpg"
$pngPath = Join-Path $PSScriptRoot "..\assets\logo.png"
$icoPath = Join-Path $PSScriptRoot "..\assets\icon.ico"

$img = [System.Drawing.Image]::FromFile($inputPath)

function Get-RoundedRectanglePath([System.Drawing.RectangleF]$rect, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2

    $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

# 1. Create master 256x256 bitmap with rounded corners and zoomed-in crop
$masterSize = 256
$masterBmp = New-Object System.Drawing.Bitmap $masterSize, $masterSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($masterBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Margin & rounded squircle geometry
$margin = 4.0
$radius = 50.0
$cardRect = [System.Drawing.RectangleF]::new($margin, $margin, ($masterSize - 2 * $margin), ($masterSize - 2 * $margin))
$roundPath = Get-RoundedRectanglePath $cardRect $radius

# Source crop: center (508, 532), size 700x700 (zoomed in on FS logo)
$cropX = 158
$cropY = 182
$cropSize = 700
$srcRect = [System.Drawing.RectangleF]::new($cropX, $cropY, $cropSize, $cropSize)

# Clip to rounded squircle and draw zoomed image
$g.SetClip($roundPath)
$g.DrawImage($img, $cardRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.ResetClip()

# Draw sleek cyber-cyan border around squircle
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 0, 225, 225)), 2.0
$borderPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
$g.DrawPath($borderPen, $roundPath)
$borderPen.Dispose()
$roundPath.Dispose()
$g.Dispose()

# Save high-res PNG for preview
$masterBmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Build multi-resolution icon (256, 128, 64, 48, 32, 24, 16)
$sizes = @(256, 128, 64, 48, 32, 24, 16)
$entries = @()

foreach ($sz in $sizes) {
    $resized = New-Object System.Drawing.Bitmap $sz, $sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $rg = [System.Drawing.Graphics]::FromImage($resized)
    $rg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $rg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $rg.Clear([System.Drawing.Color]::Transparent)
    $rg.DrawImage($masterBmp, 0, 0, $sz, $sz)
    $rg.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $resizedBytes = $ms.ToArray()
    $ms.Dispose()
    $resized.Dispose()

    $entries += [PSCustomObject]@{
        Width = $sz
        Height = $sz
        Bytes = $resizedBytes
    }
}

$img.Dispose()
$masterBmp.Dispose()

# Write ICO binary
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type 1 = ICO
$bw.Write([uint16]$entries.Count) # Count of sub-images

# Calculate offset after header and directory entries
$offset = 6 + (16 * $entries.Count)

foreach ($entry in $entries) {
    $wByte = if ($entry.Width -ge 256) { [byte]0 } else { [byte]$entry.Width }
    $hByte = if ($entry.Height -ge 256) { [byte]0 } else { [byte]$entry.Height }

    $bw.Write($wByte)
    $bw.Write($hByte)
    $bw.Write([byte]0) # Palette count
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Color planes
    $bw.Write([uint16]32)# Bits per pixel
    $bw.Write([uint32]$entry.Bytes.Length)
    $bw.Write([uint32]$offset)

    $offset += $entry.Bytes.Length
}

foreach ($entry in $entries) {
    $bw.Write($entry.Bytes)
}

$bw.Close()
$fs.Close()

Write-Host "Created assets/icon.ico (hybrid PNG+DIB multi-resolution 256..16) and assets/logo.png successfully!"
