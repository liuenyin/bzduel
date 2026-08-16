import os

root = "E:/School+AI/school-dice-duel"

with open("tp_matches.txt", "w", encoding="utf-8") as out:
    for dirpath, dirnames, filenames in os.walk(root):
        if "node_modules" in dirpath or "dist" in dirpath or ".git" in dirpath or ".agents" in dirpath:
            continue
        for f in filenames:
            if f.endswith((".js", ".cjs", ".mjs", ".json", ".py")):
                p = os.path.join(dirpath, f)
                with open(p, "r", encoding="utf-8", errors="ignore") as file:
                    lines = file.readlines()
                    for idx, line in enumerate(lines):
                        line_lower = line.lower()
                        if "tp" in line_lower or "draft" in line_lower or "card" in line_lower:
                            out.write(f"{p}:{idx+1}: {line.strip()}\n")

print("Done writing tp_matches.txt")
