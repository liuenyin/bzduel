import os, re

root = "E:/School+AI/school-dice-duel"

with open("tp_deductions.txt", "w", encoding="utf-8") as out:
    for dirpath, _, filenames in os.walk(root):
        if any(x in dirpath for x in ["node_modules", "dist", ".git", ".agents"]):
            continue
        for f in filenames:
            if f.endswith((".js", ".cjs", ".mjs")):
                p = os.path.join(dirpath, f)
                with open(p, "r", encoding="utf-8", errors="ignore") as file:
                    lines = file.readlines()
                    for idx, line in enumerate(lines):
                        if "tp" in line.lower():
                            out.write(f"{p}:{idx+1}: {line.strip()}\n")

print("Wrote tp_deductions.txt")
