lines = open('server/game/engine.js', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'SKILL.NINE_LIVES' in line:
        print(f"Line {i+1}: {line.strip()}")
