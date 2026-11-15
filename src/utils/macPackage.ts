import JSZip from 'jszip';

export const DEFAULT_MAC_TRIAL_ORIGIN =
  'https://ais-pre-jborx4z7qmtu36ds6q5n2y-73714010682.europe-west1.run.app';

const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;

export function sanitizeMacAppOrigin(
  rawOrigin?: string | null,
  fallbackHost?: string | null
): string {
  const candidates = [
    rawOrigin?.trim() || '',
    fallbackHost?.trim() ? `https://${fallbackHost.trim()}` : '',
    DEFAULT_MAC_TRIAL_ORIGIN,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      if (!parsed.host || !SAFE_HOST_PATTERN.test(parsed.host)) continue;
      if (parsed.username || parsed.password) continue;
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Try next candidate
    }
  }

  return DEFAULT_MAC_TRIAL_ORIGIN;
}

export function buildMacCommandScript(appOrigin: string): string {
  const safeOrigin = sanitizeMacAppOrigin(appOrigin);
  return `#!/bin/bash
set -euo pipefail

APP_URL="${safeOrigin}"
APP_DIR="$HOME/Applications"
APP_BUNDLE="$APP_DIR/ColabForge.app"
TMP_SCPT="$(mktemp -t colabforge_launch).applescript"

trap 'rm -f "$TMP_SCPT"' EXIT
mkdir -p "$APP_DIR"

cat << 'EOF' > "$TMP_SCPT"
on run
  set targetUrl to "${safeOrigin}"
  do shell script "
    URL=" & quoted form of targetUrl & "
    if [ -d '/Applications/Google Chrome.app' ]; then
      open -na 'Google Chrome' --args --app=\"$URL\"
    elif [ -d \"$HOME/Applications/Google Chrome.app\" ]; then
      open -na \"$HOME/Applications/Google Chrome.app\" --args --app=\"$URL\"
    elif [ -d '/Applications/Microsoft Edge.app' ]; then
      open -na 'Microsoft Edge' --args --app=\"$URL\"
    elif [ -d '/Applications/Brave Browser.app' ]; then
      open -na 'Brave Browser' --args --app=\"$URL\"
    elif [ -d '/Applications/Arc.app' ]; then
      open -a 'Arc' \"$URL\"
    else
      open -a 'Safari' \"$URL\"
    fi
  "
end run
EOF

rm -rf "$APP_BUNDLE"
/usr/bin/osacompile -o "$APP_BUNDLE" "$TMP_SCPT"

echo "ColabForge masaüstü uygulaması hazırlandı: $APP_BUNDLE"
echo "Uygulama penceresi açılıyor..."
open "$APP_BUNDLE"
`;
}

export function buildMacReadmeText(appOrigin: string): string {
  const safeOrigin = sanitizeMacAppOrigin(appOrigin);
  return `ColabForge — MacBook Deneme Sürümü Başlatıcısı
==================================================

Hedef Stüdyo Adresi: ${safeOrigin}

1) Hızlı Başlatma (MacBook .app Oluşturucu)
------------------------------------------
1. İndirdiğiniz ZIP dosyasını çift tıklayarak açın.
2. "ColabForge Baslat.command" dosyasına çift tıklayın.
   - İlk açılışta macOS güvenlik uyarısı çıkarsa dosyaya Sağ Tık -> "Aç" deyin.
3. Terminal otomatik olarak Uygulamalarım (~/Applications) klasörüne
   "ColabForge.app" kısayolunu kurar ve stüdyoyu ayrı bir uygulama penceresinde açar.
   Bundan sonra ColabForge'u doğrudan Spotlight (Cmd + Space) veya Dock üzerinden açabilirsiniz.

2) Alternatif: Safari / Chrome ile Tek Tıkta Dock'a Ekleme
----------------------------------------------------------
- Safari kullanıyorsanız: Üst menüden "Dosya" -> "Dock'a Ekle..." seçeneğini tıklayın.
- Chrome kullanıyorsanız: Adres çubuğunun sağındaki "Yükle" simgesine tıklayın.
`;
}

export async function createMacTrialZipBuffer(
  rawOrigin?: string | null,
  fallbackHost?: string | null
): Promise<{ buffer: Buffer; origin: string }> {
  const origin = sanitizeMacAppOrigin(rawOrigin, fallbackHost);
  const zip = new JSZip();

  zip.file('ColabForge Baslat.command', buildMacCommandScript(origin), {
    unixPermissions: '755',
  });
  zip.file('BeniOku_Mac.txt', buildMacReadmeText(origin), {
    unixPermissions: '644',
  });

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { buffer, origin };
}
