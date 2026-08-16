import re

with open("shared/cards.js", "r", encoding="utf-8") as f:
    content = f.read()

# find all card objects
pattern = r"\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*subject:\s*'([^']+)',\s*type:\s*([^,]+),\s*tpCost:\s*(\d+),\s*desc:\s*'([^']+)'\s*\}"
matches = re.findall(pattern, content)

print(f"Total cards matched: {len(matches)}")
for m in matches:
    cid, name, subj, ctype, tpcost, desc = m
    # count stars in UI assumption: tpcost stars
    print(f"ID: {cid:15} Name: {name:12} Subj: {subj:10} tpCost: {tpcost}")
