import re

with open('src/pages/battle.js', 'r', encoding='utf-8') as f:
    battle = f.read()

templates = re.findall(r'`([\s\S]*?)`', battle)
for i, t in enumerate(templates):
    div_open = len(re.findall(r'<div', t))
    div_close = len(re.findall(r'</div>', t))
    if div_open != div_close:
        print(f"Template {i}: {div_open} open, {div_close} close. Snippet: {t[:100].replace(chr(10), ' ')}")
