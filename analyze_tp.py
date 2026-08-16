import os

with open("tp_matches.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

for line in lines:
    if "server" in line or "src" in line or "shared" in line:
        if not line.startswith("E:/School+AI/school-dice-duel\\fix_"):
            print(line.strip())
