#!/usr/bin/env python3
"""Bundle only the shipped static assets into a single offline HTML file."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "dist/index.html").read_text(encoding="utf-8")
css = (ROOT / "dist/styles.css").read_text(encoding="utf-8")
source = source.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')

def inline_script(match):
    path = ROOT / "dist" / match.group(1)
    code = path.read_text(encoding="utf-8")
    if re.search(r"</script", code, re.IGNORECASE):
        raise ValueError("Script end tag in JS asset: " + str(path))
    return '<script>\n' + code + '\n</script>'

# Inline deferred scripts must run after the DOM exists. Keep their original order.
scripts = []
def collect_script(match):
    scripts.append(inline_script(match))
    return ''

source = re.sub(r'<script src="([^"]+)" defer></script>', collect_script, source)
license_paths = [ROOT / 'LICENSE', ROOT / 'dist/assets/FONT_LICENSE.txt'] + sorted((ROOT / 'dist/vendor').glob('*.LICENSE'))
license_text = '\n\n'.join(path.name + '\n' + path.read_text(encoding='utf-8') for path in license_paths)
if re.search(r'</script', license_text, re.IGNORECASE):
    raise ValueError('Script end tag in license text')
license_block = '<script type="text/plain" id="openprinttext-licenses">\n' + license_text + '\n</script>'
source = source.replace('</body>', '\n'.join(scripts) + '\n' + license_block + '\n</body>')
output = ROOT / 'release/OpenPrintText-v0.1.0.html'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(source, encoding='utf-8')
print(str(output))
